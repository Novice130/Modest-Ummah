import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Protected routes that require authentication
const protectedRoutes = ['/account', '/checkout'];

// Note: Admin routes are protected client-side in app/admin/layout.tsx
// because admin auth uses localStorage, not cookies

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check for PocketBase auth cookie
  const authCookie = request.cookies.get('pb_auth');
  
  // Check if trying to access protected routes
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));

  // Redirect to login if accessing protected route without auth
  if (isProtectedRoute && !authCookie) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from auth pages
  if (authCookie && (pathname === '/auth/login' || pathname === '/auth/register')) {
    return NextResponse.redirect(new URL('/account', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/account/:path*',
    '/checkout/:path*',
    '/auth/:path*',
  ],
};
