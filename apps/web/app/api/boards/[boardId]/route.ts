import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/api-guard';
import { requireBoardPermission } from '@/lib/auth/rbac';

/**
 * GET /api/boards/[boardId]
 * Get a single board with all columns, tasks, and members.
 */
export const GET = withAuth<{ boardId: string }>(async (_req, { params, userId }) => {
  const { boardId } = params;

  await requireBoardPermission(userId, boardId, 'board:view');

  const board = await prisma.board.findUnique({
    where: { id: boardId },
    include: {
      owner: {
        select: { id: true, name: true, email: true, image: true },
      },
      columns: {
        orderBy: { order: 'asc' },
        include: {
          tasks: {
            orderBy: { order: 'asc' },
            include: {
              assignee: {
                select: { id: true, name: true, email: true, image: true },
              },
              _count: { select: { comments: true } },
            },
          },
        },
      },
      members: {
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      },
    },
  });

  if (!board) {
    return NextResponse.json({ error: 'Board not found' }, { status: 404 });
  }

  return NextResponse.json(board);
});

/**
 * PATCH /api/boards/[boardId]
 * Update board title/description. Requires EDITOR role.
 */
export const PATCH = withAuth<{ boardId: string }>(async (req, { params, userId }) => {
  const { boardId } = params;

  await requireBoardPermission(userId, boardId, 'board:edit');

  const body = await req.json();
  const { title, description } = body;

  const data: Record<string, unknown> = {};
  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json(
        { error: 'Board title cannot be empty' },
        { status: 400 }
      );
    }
    data.title = title.trim();
  }
  if (description !== undefined) {
    data.description = description?.trim() || null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: 'No fields to update' },
      { status: 400 }
    );
  }

  const board = await prisma.board.update({
    where: { id: boardId },
    data,
    include: {
      owner: {
        select: { id: true, name: true, email: true, image: true },
      },
    },
  });

  return NextResponse.json(board);
});

/**
 * DELETE /api/boards/[boardId]
 * Delete a board. Requires OWNER role.
 */
export const DELETE = withAuth<{ boardId: string }>(async (_req, { params, userId }) => {
  const { boardId } = params;

  await requireBoardPermission(userId, boardId, 'board:delete');

  await prisma.board.delete({ where: { id: boardId } });

  return NextResponse.json({ message: 'Board deleted' });
});
