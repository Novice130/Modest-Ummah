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
  /**
   * users.token_version at the time the token was minted. A password change
   * or an account deletion bumps the column, which retires every token
   * carrying an older value. Optional because tokens issued before the column
   * existed carry no claim; those are read as 0.
   */
  ver?: number;
  /** Seconds since the epoch; set by createToken when the token is signed. */
  iat?: number;
  /** Admin tokens only: this session passed the second factor. See below. */
  mfa?: boolean;
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
  if (isAdmin && !adminTokenPasses2fa(payload)) return null;

  // A signature alone is not enough for a customer token: it stays valid for
  // 7 days, so a token minted before the account was deleted or its password
  // rotated would still open the account routes. One indexed lookup settles
  // both — a deleted user has no row, and a rotation bumped token_version.
  //
  // The admins table has no counter, so an admin token is judged both for its
  // row still existing and against updated_at (which a password reset bumps).
  if (isAdmin ? !(await adminTokenIsCurrent(payload)) : !(await tokenVersionIsCurrent(payload))) {
    return null;
  }

  return payload;
}

/**
 * Whether an admin token predates the last change to the admin's row. Compared
 * in whole seconds because `iat` has no finer resolution: a token minted in the
 * same second as the change stays valid.
 */
export function adminTokenPredatesRow(iat: number | undefined, updatedAt: Date): boolean {
  if (typeof iat !== 'number') return true;
  return iat < Math.floor(updatedAt.getTime() / 1000);
}

/**
 * Compares the token's `ver` claim with the user's current token_version.
 *
 * Imported lazily so a route that only needs hashPassword or createToken does
 * not pull the Drizzle client and the whole schema in with it.
 */
async function tokenVersionIsCurrent(payload: TokenPayload): Promise<boolean> {
  const [{ getDb }, { users }, { eq }] = await Promise.all([
    import('./db'),
    import('./schema'),
    import('drizzle-orm'),
  ]);

  const db = getDb();
  const [row] = await db
    .select({ tokenVersion: users.tokenVersion })
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);

  if (!row) return false;
  return row.tokenVersion === (payload.ver ?? 0);
}

async function adminTokenIsCurrent(payload: TokenPayload): Promise<boolean> {
  const [{ getDb }, { admins }, { eq }] = await Promise.all([
    import('./db'),
    import('./schema'),
    import('drizzle-orm'),
  ]);

  const [row] = await getDb()
    .select({ updatedAt: admins.updatedAt })
    .from(admins)
    .where(eq(admins.id, payload.sub))
    .limit(1);
  return !!row && !adminTokenPredatesRow(payload.iat, row.updatedAt);
}

// ─── Admin second factor ────────────────────────────────

/**
 * Off unless exactly "true". Only ever reads the environment, so with the flag
 * off nothing about admin sign-in touches the admin_totp table.
 */
export function isAdmin2faRequired(): boolean {
  return process.env.ADMIN_2FA_REQUIRED === 'true';
}

/**
 * Enforced wherever an admin token is accepted, so a token minted before the
 * flag was turned on stops working at once instead of lasting out its 24h, and
 * no route can forget the check. proxy.ts repeats this one line.
 */
export function adminTokenPasses2fa(payload: TokenPayload): boolean {
  return !isAdmin2faRequired() || payload.mfa === true;
}

export const ADMIN_PENDING_COOKIE = 'admin_2fa_pending';
export const ADMIN_PENDING_MAX_AGE_SECONDS = 600;

/**
 * Proof that the password was right and nothing more. Its `type` matches no
 * check in the app, so it opens no route, cookie or bearer; only
 * lib/actions/admin-2fa.actions.ts reads it.
 */
export async function createAdminPendingToken(adminId: string): Promise<string> {
  return new SignJWT({ type: 'admin_2fa_pending' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(adminId)
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setExpirationTime(`${ADMIN_PENDING_MAX_AGE_SECONDS}s`)
    .sign(getJwtSecret());
}

export async function verifyAdminPendingToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), { issuer: JWT_ISSUER });
    return payload.type === 'admin_2fa_pending' && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}
