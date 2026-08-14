import { createHmac, timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { wooOauthNonces } from '@/lib/schema';
import { lt } from 'drizzle-orm';
import { storeUrl } from '@/lib/woo/store';

/**
 * OAuth 1.0a "one-legged" verification, as WooCommerce implements it.
 *
 * WooCommerce presents OAuth as its plain-HTTP scheme and Basic auth as its
 * HTTPS scheme, but nothing stops a client from signing every request — and
 * Pirate Ship's first connection attempt 401'd against a Basic-only shim, with
 * OAuth as the leading suspect. Both schemes are accepted now.
 *
 * The signature is computed exactly the way WooCommerce's
 * class-wc-rest-authentication.php computes it, because that is what any
 * WooCommerce-targeting client was built against:
 *
 *   base string = METHOD & pctEnc(url) & pctEnc(sorted "k=v" pairs joined by &)
 *   signing key = consumer secret + "&"      (no token secret, one-legged)
 *   signature   = base64(HMAC-SHA1|SHA256(base string, signing key))
 *
 * Two places where a correct client still fails without care, both handled
 * below: the public URL the client signed is not the URL this process sees
 * behind a tunnel or reverse proxy, and some client libraries percent-encode
 * parameters a second time before signing.
 */

/** WooCommerce's window: a signature older than this is refused. */
const TIMESTAMP_WINDOW_SECONDS = 15 * 60;

const SIGNATURE_METHODS: Record<string, 'sha1' | 'sha256'> = {
  'HMAC-SHA1': 'sha1',
  'HMAC-SHA256': 'sha256',
};

export interface OauthAttempt {
  /** Any oauth_* parameter at all — enough to route into this scheme. */
  present: boolean;
  consumerKey: string | null;
  signature: string | null;
  signatureMethod: string | null;
  nonce: string | null;
  timestamp: number | null;
  /** Every signed parameter, decoded, excluding oauth_signature. */
  params: Array<[string, string]>;
  /** The same parameters exactly as they arrived on the wire, undecoded. */
  rawParams: Array<[string, string]>;
}

// ─── Encoding ───────────────────────────────────────────

/**
 * RFC 3986 percent-encoding. encodeURIComponent leaves !'()* alone; OAuth
 * requires them encoded, and a single stray asterisk changes the signature.
 */
function pctEncode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

// ─── Parameter collection ───────────────────────────────

/**
 * Parameters from the query string plus, if present, an
 * `Authorization: OAuth realm="…", oauth_consumer_key="…", …` header. Woo only
 * reads the query string; accepting the header too costs nothing and some
 * clients default to it.
 *
 * A JSON request body is never part of the signature — WooCommerce signs
 * `$_POST` form parameters only, and every WooCommerce client sends JSON.
 */
function parseAuthorizationHeader(header: string | null): Array<[string, string]> {
  if (!header || !/^oauth\b/i.test(header.trim())) return [];

  const out: Array<[string, string]> = [];
  const body = header.trim().slice(header.trim().indexOf(' ') + 1);
  for (const part of body.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    let value = part.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (!key || key === 'realm') continue;
    out.push([key, decodeURIComponent(value)]);
  }
  return out;
}

/** Query pairs straight off the wire, with no decoding applied. */
function rawQueryPairs(search: string): Array<[string, string]> {
  const query = search.startsWith('?') ? search.slice(1) : search;
  if (!query) return [];

  return query
    .split('&')
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf('=');
      return eq < 0
        ? ([pair, ''] as [string, string])
        : ([pair.slice(0, eq), pair.slice(eq + 1)] as [string, string]);
    });
}

export function readOauthParams(request: NextRequest): OauthAttempt {
  const decoded: Array<[string, string]> = [
    ...[...request.nextUrl.searchParams.entries()],
    ...parseAuthorizationHeader(request.headers.get('authorization')),
  ];

  const raw: Array<[string, string]> = [
    ...rawQueryPairs(request.nextUrl.search),
    ...parseAuthorizationHeader(request.headers.get('authorization')).map(
      ([k, v]) => [pctEncode(k), pctEncode(v)] as [string, string]
    ),
  ];

  const lookup = (name: string): string | null =>
    decoded.find(([key]) => key === name)?.[1] ?? null;

  // A '+' in a base64 signature decodes to a space in a query string; Woo
  // reverses that before comparing, so do the same.
  const rawSignature = lookup('oauth_signature');
  const signature = rawSignature === null ? null : rawSignature.replace(/ /g, '+');

  const timestampRaw = lookup('oauth_timestamp');
  const timestamp = timestampRaw && /^\d+$/.test(timestampRaw)
    ? Number(timestampRaw)
    : null;

  return {
    present: decoded.some(([key]) => key.startsWith('oauth_')),
    consumerKey: lookup('oauth_consumer_key'),
    signature,
    signatureMethod: lookup('oauth_signature_method'),
    nonce: lookup('oauth_nonce'),
    timestamp,
    params: decoded.filter(([key]) => key !== 'oauth_signature'),
    rawParams: raw.filter(([key]) => key !== 'oauth_signature'),
  };
}

// ─── Base string ────────────────────────────────────────

/**
 * The URLs this request could plausibly have been signed against.
 *
 * Behind a Cloudflare tunnel or Dokploy's Traefik, `request.nextUrl` is
 * http://localhost:3000 while the client signed https://public-host — the
 * signature is correct and still fails. Each candidate is tried in turn;
 * whichever matches is reported so the log names the working origin.
 */
export function baseUrlCandidates(request: NextRequest): Array<[string, string]> {
  const path = request.nextUrl.pathname;
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0].trim();
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0].trim();
  const hostHeader = request.headers.get('host');

  const candidates: Array<[string, string]> = [];
  const add = (label: string, origin: string | null | undefined) => {
    if (!origin) return;
    const url = `${origin.replace(/\/+$/, '')}${path}`;
    if (!candidates.some(([, existing]) => existing === url)) {
      candidates.push([label, url]);
    }
  };

  if (forwardedHost) add('x-forwarded-host', `${forwardedProto || 'https'}://${forwardedHost}`);
  if (hostHeader) {
    add('host-https', `https://${hostHeader}`);
    add('host-http', `http://${hostHeader}`);
  }
  add('store-url', storeUrl());
  add('next-url', request.nextUrl.origin);

  return candidates;
}

/**
 * WooCommerce's signature base string. Pairs are sorted, each `k=v` is
 * percent-encoded whole (so `=` becomes %3D), and the pairs are joined with
 * %26 — which is the strict RFC 5849 construction, matching what the
 * oauth-1.0a libraries the official clients use produce.
 */
export function signatureBaseString(
  method: string,
  url: string,
  params: Array<[string, string]>,
  alreadyEncoded: boolean
): string {
  const encodedPairs = params
    .map(([key, value]): [string, string] =>
      alreadyEncoded ? [key, value] : [pctEncode(key), pctEncode(value)]
    )
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([key, value]) => pctEncode(`${key}=${value}`));

  return [method.toUpperCase(), pctEncode(url), encodedPairs.join('%26')].join('&');
}

function signaturesMatch(expected: string, provided: string): boolean {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

export interface SignatureCheck {
  ok: boolean;
  /** Which base-URL candidate produced the match, for the diagnostic log. */
  baseUrlMatched: string | null;
  /** True when the client double-encoded its parameters before signing. */
  usedRawParams: boolean;
}

export function verifyOauthSignature(params: {
  request: NextRequest;
  attempt: OauthAttempt;
  consumerSecret: string;
}): SignatureCheck {
  const { request, attempt, consumerSecret } = params;
  if (!attempt.signature || !attempt.signatureMethod) {
    return { ok: false, baseUrlMatched: null, usedRawParams: false };
  }

  const algorithm = SIGNATURE_METHODS[attempt.signatureMethod.toUpperCase()];
  if (!algorithm) {
    return { ok: false, baseUrlMatched: null, usedRawParams: false };
  }

  // One-legged: the token secret half of the key is empty, but the separator
  // stays. Woo does not encode the secret; ours are hex, so it makes no
  // difference either way.
  const signingKey = `${consumerSecret}&`;

  for (const [label, url] of baseUrlCandidates(request)) {
    // Pass 1: parameters as WooCommerce normalises them (decode, re-encode).
    // Pass 2: parameters exactly as they arrived, for clients that sign the
    // already-encoded form and therefore effectively double-encode.
    for (const [alreadyEncoded, pairs] of [
      [false, attempt.params],
      [true, attempt.rawParams],
    ] as Array<[boolean, Array<[string, string]>]>) {
      const base = signatureBaseString(request.method, url, pairs, alreadyEncoded);
      const expected = createHmac(algorithm, signingKey).update(base).digest('base64');
      if (signaturesMatch(expected, attempt.signature)) {
        return { ok: true, baseUrlMatched: label, usedRawParams: alreadyEncoded };
      }
    }
  }

  return { ok: false, baseUrlMatched: null, usedRawParams: false };
}

// ─── Timestamp and nonce ────────────────────────────────

export function timestampSkewSeconds(timestamp: number | null): number | null {
  if (timestamp === null) return null;
  return Math.round(Date.now() / 1000) - timestamp;
}

export function isTimestampFresh(timestamp: number | null): boolean {
  const skew = timestampSkewSeconds(timestamp);
  if (skew === null) return false;
  return Math.abs(skew) <= TIMESTAMP_WINDOW_SECONDS;
}

/**
 * Records the nonce, returning false if this key has used it before.
 *
 * A one-legged signature is a bearer credential for the life of the timestamp
 * window: anyone who observes one can replay it verbatim. The unique index on
 * (key_id, nonce) is what makes each signed request single-use, so a failure to
 * insert for any *other* reason must also refuse the request rather than fall
 * through to "allowed".
 */
export async function consumeNonce(params: {
  keyId: string;
  nonce: string;
  timestamp: number;
}): Promise<boolean> {
  const db = getDb();

  try {
    await db.insert(wooOauthNonces).values({
      keyId: params.keyId,
      nonce: params.nonce.slice(0, 200),
      timestamp: params.timestamp,
    });
  } catch {
    return false;
  }

  // Opportunistic prune; the window is the only thing that has to be retained.
  void Promise.resolve(
    db
      .delete(wooOauthNonces)
      .where(lt(wooOauthNonces.createdAt, new Date(Date.now() - TIMESTAMP_WINDOW_SECONDS * 1000)))
  ).catch(() => {});

  return true;
}
