'use server';

import { cookies } from 'next/headers';
import { verifyToken, clearAuthCookie, createAuthCookie } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { users, admins } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import type { TokenPayload } from '@/lib/auth';

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
    const [admin] = await db.select().from(admins).where(eq(admins.email, payload.email)).limit(1);
    if (!admin) return null;
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name || '',
      type: 'admin',
    };
  } else if (!isAdmin && payload.type === 'user') {
    const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (!user) return null;
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

export async function setSession(token: string, isAdmin = false) {
  const maxAge = isAdmin ? 86400 : 604800; // 24h or 7d
  const cookieName = isAdmin ? 'admin_token' : 'auth_token';
  
  const cookieStore = await cookies();
  cookieStore.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: maxAge,
    path: '/',
  });
}

import { verifyPassword, createToken, hashPassword } from '@/lib/auth';

export async function signInAction(email: string, password: string) {
  if (!email || !password) return { error: 'Email and password are required' };

  try {
    const db = getDb();
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);

    if (!user) return { error: 'Invalid email or password.' };

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) return { error: 'Invalid email or password.' };

    const token = await createToken({
      sub: user.id,
      email: user.email,
      name: user.name || '',
      type: 'user',
    });

    await setSession(token, false);

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

export async function adminSignInAction(email: string, password: string) {
  if (!email || !password) return { error: 'Email and password required' };

  try {
    const db = getDb();
    const [admin] = await db.select().from(admins).where(eq(admins.email, email)).limit(1);

    if (!admin) return { error: 'Invalid credentials' };

    const valid = await verifyPassword(password, admin.passwordHash);
    if (!valid) return { error: 'Invalid credentials' };

    const token = await createToken({
      sub: admin.id,
      email: admin.email,
      name: admin.name || '',
      type: 'admin',
    }, true);

    await setSession(token, true);

    return { id: admin.id, email: admin.email, name: admin.name || '' };
  } catch (e) {
    console.error('adminSignInAction error:', e);
    return { error: 'Something went wrong. Please try again.' };
  }
}

export async function signUpAction(email: string, password: string, name: string) {
  if (!email || !password || !name) return { error: 'All fields are required' };

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
    });

    await setSession(token, false);

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
