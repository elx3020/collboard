import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

/**
 * Next.js Middleware for route protection.
 *
 * This middleware runs BEFORE the request reaches Next.js pages/API routes.
 * It checks for a valid JWT session and redirects unauthenticated users
 * to the sign-in page.
 *
 * Protected routes:
 *   - /dashboard/**
 *   - /boards/**
 *   - /settings/**
 *   - /api/** (except /api/auth/**, /api/health)
 *
 * Public routes:
 *   - / (landing page)
 *   - /auth/** (sign-in, sign-up, etc.)
 *   - /api/auth/** (NextAuth routes)
 *   - /api/health
 *   - /_next/** (Next.js internals)
 *   - /favicon.ico, static assets
 */
export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;

    // If the user's session has a refresh token error, redirect to sign-in
    if (token?.error === 'RefreshTokenError') {
      const signInUrl = new URL('/auth/signin', req.url);
      signInUrl.searchParams.set('error', 'SessionExpired');
      signInUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(signInUrl);
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      // Return true if the user is authenticated (has a valid JWT)
      authorized({ token }) {
        return !!token;
      },
    },
    pages: {
      signIn: '/auth/signin',
    },
  }
);

/**
 * Matcher configuration — defines which routes the middleware applies to.
 * Uses Next.js matcher syntax with negative lookaheads for exclusions.
 */
export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon)
     * - public folder files
     * - auth pages (sign-in, sign-up, error)
     * - API auth routes (NextAuth endpoints)
     * - API health endpoint
     * - Landing page
     */
    '/dashboard/:path*',
    '/boards/:path*',
    '/settings/:path*',
    '/api/((?!auth|health).*)',
  ],
};
