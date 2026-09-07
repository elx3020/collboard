import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/api-guard';
import { validateAccountName } from '@/lib/account/validate-name';

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
