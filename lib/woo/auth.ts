import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { apiKeys, integrationEvents, type ApiKeySelect } from '@/lib/schema';
import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { decryptSecret } from '@/lib/woo/secret-box';
import {
  consumeNonce,
  isTimestampFresh,
  readOauthParams,
  timestampSkewSeconds,
  verifyOauthSignature,
} from '@/lib/woo/oauth';

/**
 * Authentication for the WooCommerce-compatible REST surface.
 *
 * WooCommerce over HTTPS authenticates with HTTP Basic — consumer key as the
 * username, consumer secret as the password. The documented fallback, for
 * servers that strip the Authorization header, is the same pair as query
 * string parameters. Both are supported here.
 *
 * OAuth 1.0a one-legged is WooCommerce's documented scheme for *plain HTTP*,
 * but a client is free to sign every request regardless of transport — and
 * Pirate Ship's first attempt 401'd against a Basic-only implementation. It is
 * accepted too now; the signature machinery lives in lib/woo/oauth.ts.
 *
 * SECURITY: this is a public, internet-facing surface that serves customer
 * names, street addresses, emails and phone numbers. proxy.ts matches only
 * /admin and /account, so none of its protection applies to these routes —
 * every handler must call requireWooAuth() as its first statement.
 */

export type ApiKeyPermission = 'read' | 'read_write';

export interface WooAuthContext {
  keyId: string;
  permissions: ApiKeyPermission;
  description: string;
}

export type WooAuthFailure =
  | 'disabled'
  | 'insecure'
  | 'unauthorized'
  | 'rate_limited'
  | 'forbidden_write';

export type WooAuthResult =
  | { ok: true; context: WooAuthContext; diagnostic?: AuthDiagnostic }
  | { ok: false; reason: WooAuthFailure; diagnostic?: AuthDiagnostic };

/**
 * Non-secret description of how a caller tried to authenticate, recorded on
 * failures so an integration that cannot connect can be diagnosed without
 * asking the vendor what scheme they use. Records the presence and shape of
 * credentials, never their values.
 */
export interface AuthDiagnostic {
  /** Which scheme the request was routed into, once one was identified. */
  scheme: 'basic' | 'query' | 'oauth1' | null;
  authHeaderScheme: string | null;
  hasQueryConsumerKey: boolean;
  hasQueryConsumerSecret: boolean;
  /** Names only — reveals OAuth 1.0a without capturing the signature. */
  oauthParams: string[];
  signatureMethod: string | null;
  /** Which base-URL candidate the signature verified against, if any. */
  baseUrlMatched: string | null;
  timestampSkewSeconds: number | null;
  nonceReplay: boolean;
  consumerKeyPrefix: string | null;
  matchedKeyId: string | null;
  detail: string;
}

export function describeAuthAttempt(request: NextRequest): AuthDiagnostic {
  const header = request.headers.get('authorization');
  const scheme = header ? header.split(' ')[0].toLowerCase() : null;
  const params = request.nextUrl.searchParams;

  const credentials = extractCredentials(request);
  const oauth = readOauthParams(request);

  return {
    scheme: credentials
      ? parseBasicAuth(header)
        ? 'basic'
        : 'query'
      : oauth.present
        ? 'oauth1'
        : null,
    authHeaderScheme: scheme,
    hasQueryConsumerKey: params.has('consumer_key'),
    hasQueryConsumerSecret: params.has('consumer_secret'),
    oauthParams: oauth.params.map(([key]) => key).filter((k) => k.startsWith('oauth_')),
    signatureMethod: oauth.signatureMethod,
    baseUrlMatched: null,
    timestampSkewSeconds: timestampSkewSeconds(oauth.timestamp),
    nonceReplay: false,
    // First 6 chars only: enough to tell "wrong key" from "right key, wrong
    // secret" when comparing against the admin UI, not enough to use.
    consumerKeyPrefix: (credentials?.consumerKey ?? oauth.consumerKey)?.slice(0, 6) ?? null,
    matchedKeyId: null,
    detail: '',
  };
}

/**
 * Deliberately loose. Consumer keys are 160 bits of CSPRNG output, so this is
 * not standing between anyone and a brute force — it exists to cap database
 * work from a client stuck in a retry loop. Set tight (10), it fires during
 * exactly the situation it must not interfere with: an operator debugging a
 * failed integration, where a 429 replaces the diagnostic 401 that explains
 * what is actually wrong.
 */
const MAX_AUTH_FAILURES = 60;
const AUTH_FAILURE_WINDOW_MINUTES = 15;

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// ─── Key generation ─────────────────────────────────────

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Generate a WooCommerce-format credential pair. 40 hex characters is 160 bits
 * of CSPRNG output, matching WooCommerce's own key format.
 */
export function generateKeyPair(): {
  consumerKey: string;
  consumerSecret: string;
  truncatedKey: string;
} {
  const consumerKey = `ck_${randomBytes(20).toString('hex')}`;
  const consumerSecret = `cs_${randomBytes(20).toString('hex')}`;
  return {
    consumerKey,
    consumerSecret,
    truncatedKey: consumerKey.slice(-7),
  };
}

/**
 * Constant-time comparison of two SHA-256 hex digests. Both sides are already
 * fixed-width (64 hex chars → 32 bytes), so timingSafeEqual cannot throw on a
 * length mismatch — but guard anyway in case a malformed row is stored.
 */
function safeEqualDigest(digestA: string, digestB: string): boolean {
  const bufA = Buffer.from(digestA, 'hex');
  const bufB = Buffer.from(digestB, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}

// ─── Credential extraction ──────────────────────────────

interface Credentials {
  consumerKey: string;
  consumerSecret: string;
}

function parseBasicAuth(header: string | null): Credentials | null {
  if (!header) return null;
  const [scheme, encoded] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'basic' || !encoded) return null;

  let decoded: string;
  try {
    decoded = Buffer.from(encoded, 'base64').toString('utf8');
  } catch {
    return null;
  }

  // The secret may itself contain a colon; only split on the first one.
  const separator = decoded.indexOf(':');
  if (separator < 0) return null;

  const consumerKey = decoded.slice(0, separator);
  const consumerSecret = decoded.slice(separator + 1);
  if (!consumerKey || !consumerSecret) return null;
  return { consumerKey, consumerSecret };
}

function parseQueryAuth(request: NextRequest): Credentials | null {
  const consumerKey = request.nextUrl.searchParams.get('consumer_key');
  const consumerSecret = request.nextUrl.searchParams.get('consumer_secret');
  if (!consumerKey || !consumerSecret) return null;
  return { consumerKey, consumerSecret };
}

export function extractCredentials(request: NextRequest): Credentials | null {
  return (
    parseBasicAuth(request.headers.get('authorization')) ||
    parseQueryAuth(request)
  );
}

/**
 * True when the caller presented credentials of any kind.
 *
 * Discovery endpoints are anonymous in WordPress, but a caller that *does*
 * present credentials still expects them to be checked — WooCommerce's
 * authentication filter runs on every REST request and rejects a bad key even
 * on a route that needs none. Distinguishing "anonymous" from "wrong" is what
 * this enables.
 */
export function hasCredentials(request: NextRequest): boolean {
  return Boolean(extractCredentials(request)) || readOauthParams(request).present;
}

export function isShimEnabled(): boolean {
  return process.env.WOO_SHIM_ENABLED === 'true';
}

// ─── Request metadata ───────────────────────────────────

export function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

function isSecure(request: NextRequest): boolean {
  // Behind Dokploy/Traefik the origin request is plain HTTP; the proxy sets
  // x-forwarded-proto. Trust it here because the deployment terminates TLS.
  const proto =
    request.headers.get('x-forwarded-proto') || request.nextUrl.protocol.replace(':', '');
  return proto === 'https';
}

// ─── Rate limiting ──────────────────────────────────────

/**
 * Counts recent 401s from this IP in the integration_events log. Reuses the
 * window/threshold shape of lib/admin-login-guard.ts rather than adding a
 * second attempts table.
 */
async function isRateLimited(ip: string): Promise<boolean> {
  if (ip === 'unknown') return false;

  const db = getDb();
  const windowStart = new Date(Date.now() - AUTH_FAILURE_WINDOW_MINUTES * 60 * 1000);

  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(integrationEvents)
    .where(
      and(
        eq(integrationEvents.ip, ip),
        eq(integrationEvents.statusCode, 401),
        gte(integrationEvents.createdAt, windowStart)
      )
    );

  return (row?.count ?? 0) >= MAX_AUTH_FAILURES;
}

// ─── Main entry point ───────────────────────────────────

export async function requireWooAuth(request: NextRequest): Promise<WooAuthResult> {
  // Kill switch. Returns as "route not found" so a disabled shim is
  // indistinguishable from one that was never deployed.
  if (process.env.WOO_SHIM_ENABLED !== 'true') {
    return { ok: false, reason: 'disabled' };
  }

  // Credentials travel in cleartext under Basic auth; refuse to accept them
  // over a plaintext connection in production.
  if (process.env.NODE_ENV === 'production' && !isSecure(request)) {
    return { ok: false, reason: 'insecure' };
  }

  const ip = clientIp(request);
  if (await isRateLimited(ip)) {
    return { ok: false, reason: 'rate_limited' };
  }

  const diagnostic = describeAuthAttempt(request);

  const credentials = extractCredentials(request);
  if (!credentials) {
    const oauth = readOauthParams(request);
    if (oauth.present) {
      return authenticateOauth(request, diagnostic);
    }

    return {
      ok: false,
      reason: 'unauthorized',
      diagnostic: {
        ...diagnostic,
        detail: 'no Basic auth header and no consumer_key/consumer_secret query pair',
      },
    };
  }

  const db = getDb();
  const [row] = await db
    .select()
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.consumerKeyHash, sha256(credentials.consumerKey)),
        isNull(apiKeys.revokedAt)
      )
    )
    .limit(1);

  if (!row) {
    // Burn roughly the same work as a real comparison so a missing key and a
    // wrong secret are not distinguishable by response latency.
    safeEqualDigest(sha256(credentials.consumerSecret), sha256('decoy'));
    return {
      ok: false,
      reason: 'unauthorized',
      diagnostic: {
        ...diagnostic,
        detail: 'consumer key does not match any active (non-revoked) key',
      },
    };
  }

  const secretMatches = safeEqualDigest(
    sha256(credentials.consumerSecret),
    row.consumerSecretHash
  );
  if (!secretMatches) {
    return {
      ok: false,
      reason: 'unauthorized',
      diagnostic: {
        ...diagnostic,
        matchedKeyId: row.id,
        detail: 'consumer key matched, consumer secret did not',
      },
    };
  }

  return grantAccess(request, row, diagnostic);
}

/**
 * Shared tail for both schemes: the write-permission check and the last-seen
 * stamp. Authentication proving *who* is calling never implies they may write.
 */
function grantAccess(
  request: NextRequest,
  row: ApiKeySelect,
  diagnostic: AuthDiagnostic
): WooAuthResult {
  if (WRITE_METHODS.has(request.method) && row.permissions !== 'read_write') {
    return {
      ok: false,
      reason: 'forbidden_write',
      diagnostic: {
        ...diagnostic,
        matchedKeyId: row.id,
        detail: `key has '${row.permissions}' permission, request is ${request.method}`,
      },
    };
  }

  // Best-effort last-seen stamp; never fail a valid request over it.
  const db = getDb();
  void Promise.resolve(
    db.update(apiKeys).set({ lastAccess: new Date() }).where(eq(apiKeys.id, row.id))
  ).catch(() => {});

  return {
    ok: true,
    context: {
      keyId: row.id,
      permissions: row.permissions,
      description: row.description,
    },
    // Carried through on success too: knowing which scheme and which base URL
    // a working integration actually used is the answer to the next question.
    diagnostic: { ...diagnostic, matchedKeyId: row.id, detail: 'authenticated' },
  };
}

// ─── OAuth 1.0a one-legged ──────────────────────────────

/**
 * Verifies a signed request. Order matters: the signature is checked before the
 * nonce is consumed, so an attacker cannot burn a legitimate client's nonces by
 * replaying garbage signatures.
 */
async function authenticateOauth(
  request: NextRequest,
  base: AuthDiagnostic
): Promise<WooAuthResult> {
  const attempt = readOauthParams(request);
  const diagnostic: AuthDiagnostic = { ...base, scheme: 'oauth1' };

  const fail = (detail: string, extra: Partial<AuthDiagnostic> = {}): WooAuthResult => ({
    ok: false,
    reason: 'unauthorized',
    diagnostic: { ...diagnostic, ...extra, detail },
  });

  if (!attempt.consumerKey || !attempt.signature || !attempt.nonce) {
    return fail('OAuth request is missing consumer key, signature or nonce');
  }
  if (!attempt.signatureMethod) {
    return fail('OAuth request did not name a signature method');
  }
  if (!isTimestampFresh(attempt.timestamp)) {
    return fail(
      'OAuth timestamp is outside the 15 minute window (check server clock skew)'
    );
  }

  const db = getDb();
  const [row] = await db
    .select()
    .from(apiKeys)
    .where(
      and(eq(apiKeys.consumerKeyHash, sha256(attempt.consumerKey)), isNull(apiKeys.revokedAt))
    )
    .limit(1);

  if (!row) {
    return fail('consumer key does not match any active (non-revoked) key');
  }

  const secret = decryptSecret(row.consumerSecretEnc);
  if (!secret) {
    return fail(
      'OAuth attempted against a key minted before secret encryption — regenerate the key',
      { matchedKeyId: row.id }
    );
  }

  const check = verifyOauthSignature({ request, attempt, consumerSecret: secret });
  if (!check.ok) {
    return fail('OAuth signature did not verify against any known base URL', {
      matchedKeyId: row.id,
    });
  }

  diagnostic.baseUrlMatched = check.baseUrlMatched;

  const fresh = await consumeNonce({
    keyId: row.id,
    nonce: attempt.nonce,
    timestamp: attempt.timestamp as number,
  });
  if (!fresh) {
    return fail('OAuth nonce has already been used by this key (replay)', {
      matchedKeyId: row.id,
      baseUrlMatched: check.baseUrlMatched,
      nonceReplay: true,
    });
  }

  return grantAccess(request, row, diagnostic);
}
