/**
 * Google and Apple sign-in, shared by /api/auth/{google,apple} (browser,
 * cookie) and /api/v1/auth/{google,apple} (app, bearer token). Not a route:
 * only files named route.ts are served.
 */
import { getDb } from '@/lib/db';
import { users } from '@/lib/schema';
import { createToken } from '@/lib/auth';
import { eq, sql } from 'drizzle-orm';
import { jwtVerify, createRemoteJWKSet } from 'jose';

type User = typeof users.$inferSelect;

export class SocialAuthError extends Error {
  constructor(public status: number, message: string, public code: string) {
    super(message);
  }
}

export interface SocialIdentity {
  provider: 'google' | 'apple';
  providerId: string;
  /** Lower-cased, and only set when the provider says it verified it. */
  email: string | null;
  name: string;
  avatar: string | null;
}

const isTrue = (v: unknown) => v === true || v === 'true';

// ─── Google ─────────────────────────────────────────────

const VALID_GOOGLE_CLIENT_IDS = [
  process.env.GOOGLE_CLIENT_ID,
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
  process.env.GOOGLE_ANDROID_CLIENT_ID,
  process.env.GOOGLE_IOS_CLIENT_ID,
  '488492087162-3gtbu198aonl52qckg9cdnk7s52l6c0a.apps.googleusercontent.com', // Web
  '488492087162-obnf3re3g69op8abgk61j2dbsh2p7d76.apps.googleusercontent.com', // Android
  '488492087162-6do55jqj0ldo5efjvsibea9ehfl324nk.apps.googleusercontent.com', // iOS
].filter(Boolean) as string[];

export async function verifyGoogleIdToken(idToken: string): Promise<SocialIdentity> {
  // Google's tokeninfo endpoint checks the signature and expiry.
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );
  if (!res.ok) {
    throw new SocialAuthError(401, 'Invalid or expired Google token', 'invalid_token');
  }
  const payload = await res.json();

  if (!VALID_GOOGLE_CLIENT_IDS.includes(payload.aud)) {
    console.warn('Google token audience mismatch:', payload.aud);
    throw new SocialAuthError(401, 'Token was not issued for this application', 'invalid_audience');
  }
  if (!payload.sub) {
    throw new SocialAuthError(401, 'Invalid Google token', 'invalid_token');
  }

  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
  if (!email) {
    throw new SocialAuthError(400, 'Google account has no associated email', 'no_email');
  }
  // We sign in by email. An address Google has not verified proves nothing,
  // and accepting it would let anyone open the account that owns it.
  if (!isTrue(payload.email_verified)) {
    throw new SocialAuthError(403, 'Google has not verified this email address', 'email_unverified');
  }

  return {
    provider: 'google',
    providerId: String(payload.sub),
    email,
    name: payload.name || payload.given_name || '',
    avatar: payload.picture || null,
  };
}

// ─── Apple ──────────────────────────────────────────────

const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

const VALID_APPLE_AUDIENCES = [
  process.env.APPLE_BUNDLE_ID,
  process.env.APPLE_SERVICES_ID,
  'com.modestummah.modestUmmah',
  'com.modestummah.web',
].filter(Boolean) as string[];

export async function verifyAppleIdentityToken(
  identityToken: string,
  name: unknown
): Promise<SocialIdentity> {
  let payload;
  try {
    ({ payload } = await jwtVerify(identityToken, APPLE_JWKS, {
      issuer: 'https://appleid.apple.com',
      audience: VALID_APPLE_AUDIENCES,
    }));
  } catch {
    throw new SocialAuthError(401, 'Invalid or expired Apple token', 'invalid_token');
  }
  if (!payload.sub) {
    throw new SocialAuthError(401, 'Invalid Apple identity token: missing sub', 'invalid_token');
  }

  const email =
    typeof payload.email === 'string' && isTrue(payload.email_verified)
      ? payload.email.toLowerCase()
      : null;

  return {
    provider: 'apple',
    providerId: payload.sub,
    email,
    name: typeof name === 'string' ? name : '',
    avatar: null,
  };
}

// ─── Account lookup / linking ───────────────────────────

/**
 * Finds the account for this identity (by provider id, then by verified
 * email), creating one if none exists. Returns the row as stored afterwards.
 */
export async function findOrLinkSocialUser(identity: SocialIdentity): Promise<User> {
  const db = getDb();

  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.providerId, identity.providerId))
    .limit(1);
  const linked = !!user;

  if (!user && identity.email) {
    [user] = await db.select().from(users).where(eq(users.email, identity.email)).limit(1);
  }

  if (!user) {
    const [created] = await db
      .insert(users)
      .values({
        email: identity.email || `${identity.providerId}@privaterelay.appleid.com`,
        name: identity.name || (identity.provider === 'apple' ? 'Apple User' : ''),
        avatar: identity.avatar,
        verified: true,
        authProvider: identity.provider,
        providerId: identity.providerId,
      })
      .returning();
    return created;
  }

  // Pre-hijack defence. Email sign-up never proves ownership of the address,
  // so an unverified row this provider has not signed into before may have
  // been registered by someone else ahead of the real owner. The provider has
  // just verified the address, so drop any password a squatter could know and
  // retire every token already issued for the row.
  const takeover = !linked && !user.verified;
  if (takeover) {
    console.warn(`${identity.provider} sign-in reset unverified account ${user.id}`);
  }

  const [updated] = await db
    .update(users)
    .set({
      name: user.name || identity.name || '',
      avatar: user.avatar || identity.avatar,
      authProvider: user.authProvider || identity.provider,
      // Apple has always overwritten this and Google has only filled it in;
      // kept as is so existing links keep resolving.
      providerId:
        identity.provider === 'apple' ? identity.providerId : user.providerId || identity.providerId,
      ...(takeover
        ? {
            passwordHash: null,
            verified: true,
            tokenVersion: sql`${users.tokenVersion} + 1`,
          }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))
    .returning();
  return updated;
}

export function createSocialUserToken(user: User): Promise<string> {
  return createToken({
    sub: user.id,
    email: user.email,
    name: user.name || '',
    type: 'user',
    ver: user.tokenVersion,
  });
}
