import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { integrationEvents } from '@/lib/schema';
import {
  requireWooAuth,
  clientIp,
  hasCredentials,
  isShimEnabled,
  type WooAuthContext,
  type WooAuthResult,
} from '@/lib/woo/auth';
import { WooErrors } from '@/lib/woo/errors';

/**
 * Shared entry point for every /wp-json route.
 *
 * Centralising auth here means a new endpoint cannot accidentally ship without
 * it — the handler signature only hands you a WooAuthContext once the request
 * has already been authenticated. It also guarantees every request, accepted
 * or rejected, lands in integration_events, which is how we discover what
 * Pirate Ship actually calls.
 */

export interface WooHandlerArgs {
  request: NextRequest;
  context: WooAuthContext;
  /** Parsed JSON body, or null for GET / unparseable bodies. */
  body: unknown;
}

/** Bodies larger than this are rejected rather than buffered. */
const MAX_BODY_BYTES = 256 * 1024;

/** Keys scrubbed before a request body is written to the event log. */
const SENSITIVE_KEYS = new Set([
  'consumer_key',
  'consumer_secret',
  'password',
  'token',
  'authorization',
]);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[redacted]' : redact(val, depth + 1);
  }
  return out;
}

async function logEvent(params: {
  request: NextRequest;
  statusCode: number;
  body: unknown;
}): Promise<void> {
  try {
    const db = getDb();
    await db.insert(integrationEvents).values({
      source: 'woo',
      method: params.request.method,
      // pathname only — the query string can carry consumer_key/secret.
      path: params.request.nextUrl.pathname,
      statusCode: params.statusCode,
      ip: clientIp(params.request),
      userAgent: params.request.headers.get('user-agent')?.slice(0, 500) || null,
      body: params.body === undefined ? null : (redact(params.body) as any),
    });
  } catch (error) {
    // The log is diagnostic, never load-bearing. A logging failure must not
    // turn a successful integration call into a 500.
    console.error('[woo] failed to record integration event:', error);
  }
}

async function readJsonBody(request: NextRequest): Promise<unknown> {
  if (request.method === 'GET' || request.method === 'HEAD') return null;

  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_BODY_BYTES) return { _truncated: true };

  try {
    const text = await request.text();
    if (!text) return null;
    if (text.length > MAX_BODY_BYTES) return { _truncated: true };
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export interface WooRouteOptions {
  /**
   * Serve anonymous callers.
   *
   * WordPress does not authenticate REST *discovery* — `/wp-json` and each
   * namespace index are readable by anyone, because a client has to identify
   * the site before it can decide how to authenticate to it. Pirate Ship
   * relies on exactly that: its first probe carries no credentials at all, and
   * a 401 there reads to it as "wrong credentials", which is how the
   * 2026-08-14 connection attempt failed.
   *
   * Only for routes that expose no customer data. Credentials that *are*
   * presented are still verified, so a bad key fails here as it would anywhere
   * else.
   */
  allowAnonymous?: boolean;
}

/**
 * Wrap a WooCommerce-compatible route handler with authentication, request
 * logging, and Woo-shaped error mapping.
 */
export function wooRoute(
  handler: (args: WooHandlerArgs) => Promise<NextResponse>,
  options: WooRouteOptions = {}
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    // The kill switch still applies: a disabled shim must look like it was
    // never deployed, on discovery routes too.
    if (options.allowAnonymous && !isShimEnabled()) {
      const response = WooErrors.disabled();
      await logEvent({ request, statusCode: response.status, body: null });
      return response;
    }

    const anonymous = options.allowAnonymous === true && !hasCredentials(request);

    const auth: WooAuthResult = anonymous
      ? {
          ok: true,
          context: { keyId: '', permissions: 'read', description: 'anonymous' },
        }
      : await requireWooAuth(request);

    if (!auth.ok) {
      const response =
        auth.reason === 'disabled'
          ? WooErrors.disabled()
          : auth.reason === 'insecure'
          ? WooErrors.insecure()
          : auth.reason === 'rate_limited'
          ? WooErrors.rateLimited()
          : auth.reason === 'forbidden_write'
          ? WooErrors.forbiddenWrite()
          : WooErrors.unauthorized();

      // Never log the request body for a failed auth — an unauthenticated
      // caller must not be able to write arbitrary content into our log. The
      // diagnostic is generated by us and contains no secret material.
      await logEvent({
        request,
        statusCode: response.status,
        body: auth.diagnostic ? { _auth: auth.diagnostic } : null,
      });
      return response;
    }

    let body: unknown = null;
    try {
      body = await readJsonBody(request);
    } catch {
      body = null;
    }

    // On an OAuth request, record how it authenticated alongside the body. A
    // signed integration that works tells us which base URL and signature
    // method it used, which is the thing we would otherwise have to guess.
    const authNote =
      auth.diagnostic?.scheme === 'oauth1'
        ? {
            scheme: auth.diagnostic.scheme,
            signatureMethod: auth.diagnostic.signatureMethod,
            baseUrlMatched: auth.diagnostic.baseUrlMatched,
          }
        : null;
    const logBody = authNote ? { _auth: authNote, request: body } : body;

    try {
      const response = await handler({ request, context: auth.context, body });
      await logEvent({ request, statusCode: response.status, body: logBody });
      return response;
    } catch (error: any) {
      console.error(`[woo] ${request.method} ${request.nextUrl.pathname} failed:`, error);
      await logEvent({ request, statusCode: 500, body: logBody });
      // Never surface the raw error text: it can leak schema and query details.
      return WooErrors.serverError();
    }
  };
}

/**
 * WordPress pagination headers. Woo clients — including the official REST
 * client Pirate Ship's integration is built on — read these to decide whether
 * to fetch another page. Omitting them is the classic "only the first page of
 * orders ever imports" bug.
 */
export function withPagination(
  payload: unknown,
  meta: { total: number; totalPages: number }
): NextResponse {
  return NextResponse.json(payload, {
    headers: {
      'X-WP-Total': String(meta.total),
      'X-WP-TotalPages': String(meta.totalPages),
      // Browsers can't read custom headers cross-origin without this, and some
      // clients proxy through one.
      'Access-Control-Expose-Headers': 'X-WP-Total, X-WP-TotalPages',
    },
  });
}
