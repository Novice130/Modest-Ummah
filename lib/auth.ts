import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

/**
 * Resolved on first use, not at module load — `next build` imports this file
 * while collecting page data, and the secret is a runtime-only env var.
 *
 * There is deliberately no fallback value: a known signing key would let
 * anyone forge an admin token.
 */
let _jwtSecret: Uint8Array | null = null;

function getJwtSecret(): Uint8Array {
  if (!_jwtSecret) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error(
        'JWT_SECRET is not set. Generate one with `openssl rand -base64 32` ' +
        'and add it to .env (and to your deployment environment).'
      );
    }
    _jwtSecret = new TextEncoder().encode(secret);
  }
  return _jwtSecret;
}
const JWT_ISSUER = 'modest-ummah';
const USER_TOKEN_EXPIRY = '7d';
const ADMIN_TOKEN_EXPIRY = '24h';

// ─── Password Hashing ──────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── JWT Token Management ───────────────────────────────

export interface TokenPayload {
  sub: string;        // User/Admin ID
  email: string;
  name?: string;
  type: 'user' | 'admin';
}

export async function createToken(
  payload: TokenPayload,
  isAdmin = false
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setExpirationTime(isAdmin ? ADMIN_TOKEN_EXPIRY : USER_TOKEN_EXPIRY)
    .sign(getJwtSecret());
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      issuer: JWT_ISSUER,
    });
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

// ─── Cookie Helpers ─────────────────────────────────────

export function createAuthCookie(token: string, isAdmin = false): string {
  const name = isAdmin ? 'admin_token' : 'auth_token';
  const maxAge = isAdmin ? 86400 : 604800; // 24h or 7d
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${
    process.env.NODE_ENV === 'production' ? '; Secure' : ''
  }`;
}

export function clearAuthCookie(isAdmin = false): string {
  const name = isAdmin ? 'admin_token' : 'auth_token';
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function getTokenFromCookies(
  cookieHeader: string | null,
  isAdmin = false
): string | null {
  if (!cookieHeader) return null;
  const name = isAdmin ? 'admin_token' : 'auth_token';
  const cookies = cookieHeader.split(';').map((c) => c.trim());
  const authCookie = cookies.find((c) => c.startsWith(`${name}=`));
  if (!authCookie) return null;
  return authCookie.split('=')[1] || null;
}

/**
 * Reads a bearer token from the Authorization header.
 *
 * The mobile app has no cookie jar — it stores the JWT in the Keychain and
 * sends it here. Same token, same verification; only the transport differs.
 */
export function getTokenFromAuthHeader(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match?.[1]?.trim() || null;
}

// ─── Request Auth Helpers ───────────────────────────────

export async function getAuthFromRequest(
  request: Request,
  isAdmin = false
): Promise<TokenPayload | null> {
  // Cookie first so browser behaviour is unchanged; the bearer header is the
  // fallback for non-browser clients.
  const token =
    getTokenFromCookies(request.headers.get('cookie'), isAdmin) ??
    getTokenFromAuthHeader(request.headers.get('authorization'));
  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload) return null;

  // A bearer token carries no cookie-name distinction, so the audience check
  // has to happen here — otherwise a customer token would satisfy an admin
  // route simply by being valid.
  const wantedType = isAdmin ? 'admin' : 'user';
  if (payload.type !== wantedType) return null;

  return payload;
}
