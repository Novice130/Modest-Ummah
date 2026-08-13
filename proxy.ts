import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

// Duplicated from lib/auth.ts rather than imported to keep the proxy
// dependency-light. Note: in Next 16 the proxy convention defaults to the
// Node.js runtime — the old "edge runtime" premise no longer applies, but
// avoiding bcryptjs here is still cheap insurance.
//
// Resolved lazily — `next build` loads this file, and JWT_SECRET is a
// runtime-only env var. No fallback: a known key lets anyone forge a token.
let _jwtSecret: Uint8Array | null = null;

function getJwtSecret(): Uint8Array {
  if (!_jwtSecret) {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error(
        'JWT_SECRET is not set. Generate one with `openssl rand -base64 32` ' +
        'and add it to your deployment environment.'
      );
    }
    _jwtSecret = new TextEncoder().encode(secret);
  }
  return _jwtSecret;
}
const JWT_ISSUER = 'modest-ummah';

// Routes that require user authentication
const protectedUserRoutes = ['/account'];
// Routes that require admin authentication
const protectedAdminRoutes = ['/admin'];
// Admin login is public
const adminLoginRoute = '/admin/login';

async function verifyJWT(token: string): Promise<{ sub: string; type: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), { issuer: JWT_ISSUER });
    return payload as unknown as { sub: string; type: string };
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- Admin routes ---
  if (pathname.startsWith('/admin') && pathname !== adminLoginRoute) {
    const adminToken = request.cookies.get('admin_token')?.value;

    if (!adminToken) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }

    const payload = await verifyJWT(adminToken);
    if (!payload || payload.type !== 'admin') {
      // Clear invalid cookie and redirect
      const response = NextResponse.redirect(new URL('/admin/login', request.url));
      response.cookies.delete('admin_token');
      return response;
    }

    return NextResponse.next();
  }

  // --- Protected user routes ---
  for (const route of protectedUserRoutes) {
    if (pathname.startsWith(route)) {
      const authToken = request.cookies.get('auth_token')?.value;

      if (!authToken) {
        const loginUrl = new URL('/auth/login', request.url);
        loginUrl.searchParams.set('redirect', pathname);
        return NextResponse.redirect(loginUrl);
      }

      const payload = await verifyJWT(authToken);
      if (!payload || payload.type !== 'user') {
        const loginUrl = new URL('/auth/login', request.url);
        loginUrl.searchParams.set('redirect', pathname);
        const response = NextResponse.redirect(loginUrl);
        response.cookies.delete('auth_token');
        return response;
      }

      return NextResponse.next();
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/account/:path*'],
};
