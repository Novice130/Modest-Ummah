import { NextResponse } from 'next/server';
import { getAuthFromRequest, type TokenPayload } from '@/lib/auth';

/**
 * Shared plumbing for the /api/v1 surface.
 *
 * This namespace exists because the storefront's data layer is Server Actions,
 * which are POST endpoints with encrypted, build-hash-tied action ids and a
 * React-specific wire format — a Dart client cannot call them.
 *
 * It is deliberately NOT built on /wp-json. That surface is shaped by the
 * Pirate Ship connector's contract, and GET /wp-json/wc/*_/orders returns every
 * paid order with full PII because a label printer needs it. A customer token
 * must never reach it.
 */

export const MAX_PER_PAGE = 60;
export const DEFAULT_PER_PAGE = 24;

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function apiError(status: number, message: string, code?: string) {
  return NextResponse.json({ error: { message, code: code ?? null } }, { status });
}

/**
 * Resolves the calling customer, or null. Accepts the browser's auth_token
 * cookie or an `Authorization: Bearer` header — getAuthFromRequest checks the
 * token's `type` claim, so an admin token cannot masquerade as a customer.
 */
export async function getUser(request: Request): Promise<TokenPayload | null> {
  return getAuthFromRequest(request, false);
}

/** Same, but short-circuits with a 401 body the client can render. */
export async function requireUser(
  request: Request
): Promise<{ user: TokenPayload } | { response: NextResponse }> {
  const user = await getUser(request);
  if (!user) {
    return { response: apiError(401, 'Sign in to continue', 'unauthenticated') };
  }
  return { user };
}

export function parsePagination(url: URL) {
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const requested = Number(url.searchParams.get('perPage')) || DEFAULT_PER_PAGE;
  const perPage = Math.min(MAX_PER_PAGE, Math.max(1, requested));
  return { page, perPage };
}

/**
 * Maps the public `sort` values onto what the cached reader expects. Anything
 * unrecognised falls back to newest rather than erroring — a client on an old
 * build should degrade, not break.
 */
export function parseSort(value: string | null): string {
  switch (value) {
    case 'price-asc':
      return 'price-asc';
    case 'price-desc':
      return 'price-desc';
    case 'name':
      return 'name';
    default:
      return 'newest';
  }
}
