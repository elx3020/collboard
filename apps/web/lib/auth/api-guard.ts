import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth/auth-options';
import { AuthorizationError } from '@/lib/auth/rbac';
import { UnauthorizedError } from '@/lib/auth/session';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/* eslint-disable @typescript-eslint/no-explicit-any */
type RouteHandler<P extends Record<string, string> = Record<string, string>> = (
  req: NextRequest,
  context: { params: P; userId: string }
) => Promise<NextResponse>;

/**
 * Higher-order function that wraps an API route handler with authentication
 * and error handling boilerplate.
 *
 * @example
 * ```ts
 * // app/api/boards/route.ts
 * import { withAuth } from '@/lib/auth/api-guard';
 *
 * export const GET = withAuth(async (req, { userId }) => {
 *   const boards = await prisma.board.findMany({ where: { ownerId: userId } });
 *   return NextResponse.json(boards);
 * });
 * ```
 */
export function withAuth<P extends Record<string, string> = Record<string, string>>(
  handler: RouteHandler<P>
) {
  return async (
    req: NextRequest,
    context?: { params: any }
  ) => {
    try {
      // ── Rate limiting (per-IP, 60 req/min) ──
      const clientIp = getClientIp(req.headers);
      const rl = rateLimit(`api:${clientIp}`, { limit: 60, windowSeconds: 60 });
      if (!rl.allowed) {
        logger.warn({ ip: clientIp, path: req.nextUrl.pathname }, 'Rate limit exceeded');
        return NextResponse.json(
          { error: 'Too many requests. Please try again later.' },
          {
            status: 429,
            headers: {
              'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
              'X-RateLimit-Remaining': '0',
            },
          }
        );
      }

      const session = await getServerSession(authOptions);

      if (!session?.user?.id) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        );
      }

      if (session.error === 'RefreshTokenError') {
        return NextResponse.json(
          { error: 'Session expired. Please sign in again.' },
          { status: 401 }
        );
      }

      // Resolve params (Next.js 15+ passes params as a Promise)
      const resolvedParams = context?.params
        ? await Promise.resolve(context.params)
        : {};

      return await handler(req, {
        params: resolvedParams as P,
        userId: session.user.id,
      });
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return NextResponse.json(
          { error: error.message },
          { status: 401 }
        );
      }

      if (error instanceof AuthorizationError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.statusCode }
        );
      }

      logger.error({ err: error, path: req.nextUrl.pathname }, 'API route error');
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }
  };
}
