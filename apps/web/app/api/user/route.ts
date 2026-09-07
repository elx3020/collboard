import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/api-guard';
import { validateAccountName } from '@/lib/account/validate-name';
import { verifyPassword } from '@/lib/auth/password';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * GET /api/user
 *
 * The signed-in user's own account, shaped for the settings tabs. One fetch
 * serves all four of them.
 *
 * No RBAC check — every field is scoped to the session's own userId, so there
 * is no route by which one user reaches another's account.
 */
export const GET = withAuth(async (_req, { userId }) => {
  const [user, ownedBoardsWithMembers] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        password: true,
        mutedNotificationTypes: true,
      },
    }),
    // Boards this user owns that someone else would lose if they deleted their
    // account. The owner has no BoardMember row of their own, but the `not`
    // guard keeps the count right even if one is ever added.
    prisma.board.count({
      where: { ownerId: userId, members: { some: { userId: { not: userId } } } },
    }),
  ]);

  if (!user) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  // Built field by field rather than spread: the row carries the password hash
  // and it must never reach the client.
  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    hasPassword: user.password !== null,
    mutedNotificationTypes: user.mutedNotificationTypes,
    ownedBoardsWithMembers,
  });
});

/**
 * PATCH /api/user
 * Body: { name: string }
 */
export const PATCH = withAuth(async (req, { userId }) => {
  const body = (await req.json()) as { name?: unknown };
  const result = validateAccountName(body.name);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { name: result.name },
    select: { id: true, name: true, email: true, image: true },
  });

  return NextResponse.json(user);
});

/**
 * DELETE /api/user
 * Body: { password: string } for credentials accounts,
 *       { confirmEmail: string } for OAuth-only accounts.
 *
 * Deletion cascades: the account, its sessions and refresh tokens, its
 * memberships and comments, and every board it owns — including boards shared
 * with other people, who lose them. That is the accepted design; see the spec.
 */
export const DELETE = withAuth(async (req, { userId }) => {
  // A second, much stricter limit on top of the guard's 60/min per IP. Without
  // it this endpoint is an unthrottled password oracle for a stolen session.
  const rl = rateLimit(`account-delete:${userId}`, { limit: 5, windowSeconds: 3600 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
      },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, password: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    password?: unknown;
    confirmEmail?: unknown;
  };

  // Which proof is demanded depends on what the account has. An OAuth-only
  // user has no password to re-enter, so typing their own address is the
  // deliberate act instead.
  const confirmed = user.password
    ? typeof body.password === 'string' &&
      (await verifyPassword(body.password, user.password))
    : typeof body.confirmEmail === 'string' &&
      body.confirmEmail.trim().toLowerCase() === user.email.toLowerCase();

  if (!confirmed) {
    logger.warn({ userId }, 'Account deletion confirmation failed');
    return NextResponse.json({ error: 'Confirmation failed' }, { status: 401 });
  }

  await prisma.user.delete({ where: { id: userId } });
  logger.info({ userId }, 'Account deleted');

  return NextResponse.json({ message: 'Account deleted' });
});
