import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/auth-options';
import { NextResponse } from 'next/server';

/**
 * Get the current authenticated session on the server side.
 * Use in Server Components, API Routes, and Server Actions.
 */
export async function getSession() {
  return getServerSession(authOptions);
}

/**
 * Get the current authenticated user or return null.
 * Convenience wrapper around getSession().
 */
export async function getCurrentUser() {
  const session = await getSession();
  return session?.user ?? null;
}

/**
 * Require authentication — returns user or throws a 401 response.
 * Use in API routes for clean guard patterns.
 *
 * @example
 * ```ts
 * export async function GET() {
 *   const user = await requireAuth();
 *   // user is guaranteed to be authenticated here
 * }
 * ```
 */
export async function requireAuth() {
  const session = await getSession();

  if (!session?.user) {
    throw new UnauthorizedError('Authentication required');
  }

  // Check for refresh token errors
  if (session.error === 'RefreshTokenError') {
    throw new UnauthorizedError('Session expired. Please sign in again.');
  }

  return session.user;
}

/**
 * Create a standardized unauthorized response for API routes
 */
export function unauthorizedResponse(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}

/**
 * Create a standardized forbidden response for API routes
 */
export function forbiddenResponse(message = 'Forbidden') {
  return NextResponse.json({ error: message }, { status: 403 });
}

/**
 * Custom unauthorized error class
 */
export class UnauthorizedError extends Error {
  public statusCode = 401;

  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}
