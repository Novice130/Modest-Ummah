import { cookies } from 'next/headers';

/**
 * Sets the HTTP-only auth or admin session cookie. Kept out of `'use server'`
 * action files so Next.js never exposes cookie minting as a public endpoint.
 */
export async function setSessionCookie(token: string, isAdmin = false): Promise<void> {
  const maxAge = isAdmin ? 86400 : 604800; // 24h or 7d
  const cookieName = isAdmin ? 'admin_token' : 'auth_token';

  const cookieStore = await cookies();
  cookieStore.set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/',
  });
}
