'use server';

import { cookies } from 'next/headers';
import { headers } from 'next/headers';
import { verifyToken, clearAuthCookie, createAuthCookie } from '@/lib/auth';
import { setSessionCookie } from '@/lib/session-cookie';
import { getDb } from '@/lib/db';
import { users, admins } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import type { TokenPayload } from '@/lib/auth';
import { adminIsLocked, recordAdminAttempt } from '@/lib/admin-login-guard';
import { clientIpFromHeaders, ipLimitKey } from '@/lib/client-ip';
import { rateLimitAction } from '@/lib/rate-limit-guards';
import { adminTotpStage, type AdminTotpStage } from '@/lib/admin-2fa';
import { MIN_PASSWORD_LENGTH } from '@/lib/account';

export async function getSession(isAdmin = false) {
  const cookieName = isAdmin ? 'admin_token' : 'auth_token';
  const cookieStore = await cookies();
  const token = cookieStore.get(cookieName)?.value;
  
  if (!token) return null;
  
  const payload = await verifyToken(token);
  if (!payload) return null;

  const db = getDb();

  // Validate existence in DB
  if (isAdmin && payload.type === 'admin') {
    if (!adminTokenPasses2fa(payload)) return null;
    const [admin] = await db.select().from(admins).where(eq(admins.email, payload.email)).limit(1);
    if (!admin) return null;
    if (adminTokenPredatesRow(payload.iat, admin.updatedAt)) return null;
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name || '',
      type: 'admin',
    };
  } else if (!isAdmin && payload.type === 'user') {
    const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!user) return null;
    // Retired by a password change since this cookie was issued.
    if (user.tokenVersion !== (payload.ver ?? 0)) return null;
    return {
      id: user.id,
      email: user.email,
      name: user.name || '',
      avatar: user.avatar || undefined,
      verified: user.verified || false,
      type: 'user',
    };
  }

  return null;
}

export async function clearSession(isAdmin = false) {
  const cookieName = isAdmin ? 'admin_token' : 'auth_token';
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}

import {
  verifyPassword,
  createToken,
  hashPassword,
  adminTokenPasses2fa,
  adminTokenPredatesRow,
  isAdmin2faRequired,
  createAdminPendingToken,
  ADMIN_PENDING_COOKIE,
  ADMIN_PENDING_MAX_AGE_SECONDS,
} from '@/lib/auth';

export async function signInAction(email: string, password: string) {
  if (!email || !password) return { error: 'Email and password are required' };

  const limited = await rateLimitAction('login', { email });
  if (limited) return { error: limited };

  try {
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);

    if (!user || !user.passwordHash) return { error: 'Invalid email or password.' };

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) return { error: 'Invalid email or password.' };

    const token = await createToken({
      sub: user.id,
      email: user.email,
      name: user.name || '',
      type: 'user',
      ver: user.tokenVersion,
    });

    await setSessionCookie(token, false);

    const { passwordHash: _, ...safeUser } = user;
    return {
      ...safeUser,
      id: user.id,
      created: user.createdAt.toISOString(),
      updated: user.updatedAt.toISOString(),
    };
  } catch (e) {
    console.error('signInAction error:', e);
    return { error: 'Something went wrong. Please try again.' };
  }
}

export async function adminSignInAction(
  email: string,
  password: string
): Promise<
  | { id: string; email: string; name: string }
  | { twoFactor: AdminTotpStage }
  | { error: string }
> {
  if (!email || !password) return { error: 'Email and password required' };

  const normalizedEmail = email.toLowerCase().trim();
  const headersList = await headers();
  const ip = ipLimitKey(clientIpFromHeaders(headersList));

  // In memory, ahead of the guard's queries: a flood stops here without waking
  // the database.
  const limited = await rateLimitAction('adminLogin');
  if (limited) return { error: limited };

  try {
    if (await adminIsLocked(normalizedEmail, ip)) {
      return { error: 'Too many failed attempts. Please try again later.' };
    }

    const db = getDb();
    const [admin] = await db.select().from(admins).where(eq(admins.email, normalizedEmail)).limit(1);

    if (!admin) {
      await recordAdminAttempt(normalizedEmail, ip);
      return { error: 'Invalid credentials' };
    }

    let valid = await verifyPassword(password, admin.passwordHash);
    if (!valid && password !== password.trim()) {
      valid = await verifyPassword(password.trim(), admin.passwordHash);
    }
    if (!valid) {
      await recordAdminAttempt(normalizedEmail, ip);
      return { error: 'Invalid credentials' };
    }

    // Fails closed: if the table is missing the catch below refuses the sign-in.
    // The way out is to unset ADMIN_2FA_REQUIRED, see docs/admin-2fa.md.
    if (isAdmin2faRequired()) {
      const stage = await adminTotpStage(admin.id);
      const cookieStore = await cookies();
      cookieStore.set(ADMIN_PENDING_COOKIE, await createAdminPendingToken(admin.id), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: ADMIN_PENDING_MAX_AGE_SECONDS,
        path: '/',
      });
      return { twoFactor: stage };
    }

    const token = await createToken({
      sub: admin.id,
      email: admin.email,
      name: admin.name || '',
      type: 'admin',
    }, true);

    await setSessionCookie(token, true);

    return { id: admin.id, email: admin.email, name: admin.name || '' };
  } catch (e) {
    console.error('adminSignInAction error:', e);
    return { error: 'Something went wrong. Please try again.' };
  }
}

export async function signUpAction(email: string, password: string, name: string) {
  if (!email || !password || !name) return { error: 'All fields are required' };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }

  const limited = await rateLimitAction('register', { email });
  if (limited) return { error: limited };

  try {
    const db = getDb();
    const [existingUser] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);

    if (existingUser) return { error: 'An account with this email already exists' };

    const hashedPassword = await hashPassword(password);

    const [user] = await db.insert(users).values({
      email: email.toLowerCase(),
      passwordHash: hashedPassword,
      name,
    }).returning();

    const token = await createToken({
      sub: user.id,
      email: user.email,
      name: user.name || '',
      type: 'user',
      ver: user.tokenVersion,
    });

    await setSessionCookie(token, false);

    const { passwordHash: _, ...safeUser } = user;
    return {
      ...safeUser,
      id: user.id,
      created: user.createdAt.toISOString(),
      updated: user.updatedAt.toISOString(),
    };
  } catch (e) {
    console.error('signUpAction error:', e);
    return { error: 'Something went wrong. Please try again.' };
  }
}
