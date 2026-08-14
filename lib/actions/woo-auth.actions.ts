'use server';

import { getDb } from '@/lib/db';
import { apiKeys, integrationEvents } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { getSession } from './auth.actions';
import { generateKeyPair, sha256 } from '@/lib/woo/auth';
import { encryptSecret } from '@/lib/woo/secret-box';
import { WP_VERSION } from '@/lib/woo/serialize';
import { storeUrl } from '@/lib/woo/store';
import {
  buildReturnUrl,
  permissionsForScope,
  validateWooAuthRequest,
  type WooAuthRequest,
} from '@/lib/woo/auth-endpoint';

/**
 * The approve/deny half of /wc-auth/v1/authorize.
 *
 * Every parameter arrives from the query string, so nothing here trusts the
 * caller: the request is re-validated from scratch (an approval POST is as
 * attacker-shaped as the original link), and the admin session is re-checked
 * rather than assumed from the page having rendered.
 */

export interface WooAuthOutcome {
  ok: boolean;
  /** Where to send the browser next — always back to the requesting app. */
  redirectTo?: string;
  error?: string;
}

/**
 * A short, readable account of what the callback answered with. HTML bodies
 * are reported by shape rather than quoted — a rejected POST to a single-page
 * app returns the whole application shell, which is noise, and the fact that
 * it *is* an app shell is the actual signal.
 */
function summarizeResponse(response: Response, body: string): string {
  // Cloudflare labels its own interstitials. Worth naming explicitly: a bot
  // challenge on the receiving end is not something any change to this request
  // can satisfy, and reading it as "bad payload" wastes a lot of time.
  if (response.headers.get('cf-mitigated') === 'challenge') {
    return (
      'a Cloudflare bot challenge, not their API — the callback is bot-protected and ' +
      "will refuse any server-to-server POST from this host's IP address"
    );
  }

  const trimmed = body.trim();
  if (!trimmed) return 'empty response body';
  if (/^<!doctype html|^<html/i.test(trimmed)) {
    return 'an HTML page rather than an API response — either a bot filter or an expired install session';
  }
  return trimmed.slice(0, 300);
}

async function requireAdmin() {
  const session = await getSession(true);
  if (!session) throw new Error('Unauthorized');
  return session;
}

async function logAuthEvent(params: {
  path: string;
  statusCode: number;
  body: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = getDb();
    await db.insert(integrationEvents).values({
      source: 'woo-auth',
      method: 'POST',
      path: params.path,
      statusCode: params.statusCode,
      body: params.body as never,
    });
  } catch (error) {
    console.error('[wc-auth] failed to record event:', error);
  }
}

/**
 * Mint a credential pair and hand it to the requesting app.
 *
 * Ordering matters. The key is created first because the callback has to carry
 * it, but if the app does not acknowledge with a 2xx the key is revoked again
 * immediately — a credential nobody received is a credential nobody should be
 * able to use. WooCommerce deletes the row outright; a revoked row is kept
 * here so the attempt stays visible in the audit trail.
 */
export async function approveWooAuthAction(
  params: Record<string, string>
): Promise<WooAuthOutcome> {
  await requireAdmin();

  const validation = validateWooAuthRequest(params);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }
  const request: WooAuthRequest = validation.request;

  const { consumerKey, consumerSecret, truncatedKey } = generateKeyPair();
  const permissions = permissionsForScope(request.scope);

  const db = getDb();
  const [row] = await db
    .insert(apiKeys)
    .values({
      description: `${request.appName} (auth endpoint)`,
      consumerKeyHash: sha256(consumerKey),
      consumerSecretHash: sha256(consumerSecret),
      consumerSecretEnc: encryptSecret(consumerSecret),
      truncatedKey,
      permissions,
    })
    .returning({ id: apiKeys.id, wooKeyId: apiKeys.wooKeyId });

  const payload = {
    key_id: row.wooKeyId,
    user_id: request.userId,
    consumer_key: consumerKey,
    consumer_secret: consumerSecret,
    key_permissions: request.scope,
  };

  let delivered = false;
  let failure = '';
  let responseSnippet = '';

  try {
    const response = await fetch(request.callbackUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // WooCommerce posts through wp_safe_remote_post, which identifies
        // itself this way. Some callbacks gate on it.
        'User-Agent': `WordPress/${WP_VERSION}; ${storeUrl()}`,
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45_000),
    });

    delivered = response.ok;
    if (!delivered) {
      failure = `callback responded ${response.status}`;
      // Their answer is the only evidence of *why*. Keep a readable slice of
      // it: an HTML document means a web page rejected us (an expired install
      // session, a WAF), JSON usually names the actual problem.
      responseSnippet = summarizeResponse(response, await response.text().catch(() => ''));
    }
  } catch (error: any) {
    failure = `callback request failed: ${error?.message || 'unknown error'}`;
  }

  if (!delivered) {
    await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, row.id));
    await logAuthEvent({
      path: '/wc-auth/v1/authorize',
      statusCode: 502,
      body: {
        app: request.appName,
        scope: request.scope,
        callbackHost: new URL(request.callbackUrl).host,
        outcome: 'delivery failed, key revoked',
        detail: failure,
        response: responseSnippet,
        userId: request.userId,
      },
    });
    return {
      ok: false,
      error:
        `The credentials could not be delivered to ${new URL(request.callbackUrl).host} ` +
        `(${failure}${responseSnippet ? ` — ${responseSnippet}` : ''}). The key just created ` +
        `has been revoked; nothing was left active. ` +
        (responseSnippet.includes('Cloudflare')
          ? `Connect with a manually generated key instead (Admin → Settings → Pirate Ship), ` +
            `or run this authorization from the deployed server rather than a local tunnel.`
          : `If this authorization link has been sitting open, start the connection again ` +
            `from ${request.appName} to get a fresh one.`),
    };
  }

  await logAuthEvent({
    path: '/wc-auth/v1/authorize',
    statusCode: 200,
    body: {
      app: request.appName,
      scope: request.scope,
      permissions,
      callbackHost: new URL(request.callbackUrl).host,
      truncatedKey,
      outcome: 'approved',
    },
  });

  return {
    ok: true,
    redirectTo: buildReturnUrl(request.returnUrl, request.userId, true),
  };
}

/** Denial still sends the app back to its own return URL, with success=0. */
export async function denyWooAuthAction(
  params: Record<string, string>
): Promise<WooAuthOutcome> {
  await requireAdmin();

  const validation = validateWooAuthRequest(params);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  await logAuthEvent({
    path: '/wc-auth/v1/authorize',
    statusCode: 200,
    body: { app: validation.request.appName, outcome: 'denied' },
  });

  return {
    ok: true,
    redirectTo: buildReturnUrl(validation.request.returnUrl, validation.request.userId, false),
  };
}
