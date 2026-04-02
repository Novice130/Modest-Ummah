import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'modest-ummah-jwt-secret-change-in-production-2026'
);
const JWT_ISSUER = 'modest-ummah';

// Routes that require user authentication
const protectedUserRoutes = ['/account'];
// Routes that require admin authentication
const protectedAdminRoutes = ['/admin'];
// Admin login is public
const adminLoginRoute = '/admin/login';

async function verifyJWT(token: string): Promise<{ sub: string; type: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { issuer: JWT_ISSUER });
    return payload as unknown as { sub: string; type: string };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
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
