import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { clientIpFromHeaders, ipLimitKey } from '@/lib/client-ip';
import { checkRateLimit, rateLimitMessage, type RateScope } from '@/lib/rate-limit';

/**
 * One-line guards. Each returns null to carry on.
 *
 * The bodies match what each surface's clients already render: web fetch callers
 * and Flutter read `error` as a string on the older routes, and Flutter reads
 * `error.message` on /api/v1. Server actions return `{ error }` to a toast.
 */

function decide(request: Request, scope: RateScope, email?: unknown) {
  const ip = ipLimitKey(clientIpFromHeaders(request.headers));
  return checkRateLimit(scope, { ip, email });
}

/** For routes whose error body is `{ error: "message" }`. */
export function rateLimitRoute(
  request: Request,
  scope: RateScope,
  email?: unknown
): NextResponse | null {
  const { allowed, retryAfterSeconds } = decide(request, scope, email);
  if (allowed) return null;
  return NextResponse.json(
    { error: rateLimitMessage(retryAfterSeconds, scope) },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
  );
}

/** For /api/v1 routes, whose error body is `{ error: { message, code } }`. */
export function rateLimitV1Route(
  request: Request,
  scope: RateScope,
  email?: unknown
): NextResponse | null {
  const { allowed, retryAfterSeconds } = decide(request, scope, email);
  if (allowed) return null;
  return NextResponse.json(
    { error: { message: rateLimitMessage(retryAfterSeconds, scope), code: 'rate_limited' } },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
  );
}

/** For server actions. Returns the message to put in `{ error }`, or null. */
export async function rateLimitAction(
  scope: RateScope,
  target: { email?: unknown; subject?: string } = {}
): Promise<string | null> {
  const ip = ipLimitKey(clientIpFromHeaders(await headers()));
  const { allowed, retryAfterSeconds } = checkRateLimit(scope, { ip, ...target });
  return allowed ? null : rateLimitMessage(retryAfterSeconds, scope);
}
