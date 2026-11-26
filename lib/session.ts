// Server-only: session helpers for server components and server actions.
// Deliberately NOT a `'use server'` file, so Next.js never exposes these as
// public Server Action endpoints. Do not import from client components; the
// browser-callable sign-out is `signOutAction` in lib/actions/auth.actions.ts.
// (The `server-only` package is not installed, hence this comment instead.)

import { cookies } from 'next/headers';
import { verifyToken, adminTokenPasses2fa, adminTokenPredatesRow } from '@/lib/auth';
import { getDb } from '@/lib/db';
import { users, admins } from '@/lib/schema';
import { eq } from 'drizzle-orm';

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
