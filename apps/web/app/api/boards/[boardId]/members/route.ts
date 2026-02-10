import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/api-guard';
import {
  requireBoardPermission,
  addBoardMember,
  getBoardMembers,
} from '@/lib/auth/rbac';
import type { Role } from '@/lib/auth/rbac';

/**
 * GET /api/boards/[boardId]/members
 * List all members of a board (including owner).
 */
export const GET = withAuth<{ boardId: string }>(async (_req, { params, userId }) => {
  const { boardId } = params;

  await requireBoardPermission(userId, boardId, 'board:view');

  const members = await getBoardMembers(boardId);

  if (!members) {
    return NextResponse.json({ error: 'Board not found' }, { status: 404 });
  }

  return NextResponse.json(members);
});

/**
 * POST /api/boards/[boardId]/members
 * Invite a user to a board. Requires OWNER role.
 * Body: { email: string, role?: "EDITOR" | "VIEWER" }
 */
export const POST = withAuth<{ boardId: string }>(async (req, { params, userId }) => {
  const { boardId } = params;

  await requireBoardPermission(userId, boardId, 'board:manage-members');

  const body = await req.json();
  const { email, role } = body as { email: string; role?: Role };

  if (!email || typeof email !== 'string') {
    return NextResponse.json(
      { error: 'Email is required' },
      { status: 400 }
    );
  }

  // Cannot assign OWNER role via invitation
  const memberRole: Role = role === 'EDITOR' ? 'EDITOR' : 'VIEWER';

  // Find the user by email
  const targetUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, name: true, email: true, image: true },
  });

  if (!targetUser) {
    return NextResponse.json(
      { error: 'User not found. They need to create an account first.' },
      { status: 404 }
    );
  }

  // Cannot add the board owner as a member
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: { ownerId: true },
  });

  if (board?.ownerId === targetUser.id) {
    return NextResponse.json(
      { error: 'Cannot add the board owner as a member' },
      { status: 400 }
    );
  }

  const member = await addBoardMember(boardId, targetUser.id, memberRole);

  return NextResponse.json(
    {
      ...member,
      user: targetUser,
    },
    { status: 201 }
  );
});
