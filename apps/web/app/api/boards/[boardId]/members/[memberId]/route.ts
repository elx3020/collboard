import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/api-guard';
import {
  requireBoardPermission,
  updateBoardMemberRole,
  removeBoardMember,
} from '@/lib/auth/rbac';
import type { Role } from '@/lib/auth/rbac';

/**
 * PATCH /api/boards/[boardId]/members/[memberId]
 * Update a member's role. Requires OWNER role.
 * Body: { role: "EDITOR" | "VIEWER" }
 */
export const PATCH = withAuth<{ boardId: string; memberId: string }>(async (req, { params, userId }) => {
  const { boardId, memberId } = params;

  await requireBoardPermission(userId, boardId, 'board:manage-members');

  const body = await req.json();
  const { role } = body as { role: Role };

  const validRoles: Role[] = ['EDITOR', 'VIEWER'];
  if (!role || !validRoles.includes(role)) {
    return NextResponse.json(
      { error: 'Role must be EDITOR or VIEWER' },
      { status: 400 }
    );
  }

  // Get the membership to find the userId
  const membership = await prisma.boardMember.findUnique({
    where: { id: memberId },
    select: { userId: true, boardId: true },
  });

  if (!membership || membership.boardId !== boardId) {
    return NextResponse.json(
      { error: 'Member not found' },
      { status: 404 }
    );
  }

  const updated = await updateBoardMemberRole(
    boardId,
    membership.userId,
    role
  );

  return NextResponse.json(updated);
});

/**
 * DELETE /api/boards/[boardId]/members/[memberId]
 * Remove a member from a board. OWNER can remove anyone; members can remove themselves.
 */
export const DELETE = withAuth<{ boardId: string; memberId: string }>(async (_req, { params, userId }) => {
  const { boardId, memberId } = params;

  // Get the membership
  const membership = await prisma.boardMember.findUnique({
    where: { id: memberId },
    select: { userId: true, boardId: true },
  });

  if (!membership || membership.boardId !== boardId) {
    return NextResponse.json(
      { error: 'Member not found' },
      { status: 404 }
    );
  }

  // Allow self-removal (leave board) or require OWNER permission
  if (membership.userId !== userId) {
    await requireBoardPermission(userId, boardId, 'board:manage-members');
  }

  await removeBoardMember(boardId, membership.userId);

  return NextResponse.json({ message: 'Member removed' });
});
