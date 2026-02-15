import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/api-guard';
import { requireBoardPermission } from '@/lib/auth/rbac';

/**
 * GET /api/boards/[boardId]/columns
 * List all columns for a board, ordered by position.
 */
export const GET = withAuth<{ boardId: string }>(async (_req, { params, userId }) => {
  const { boardId } = params;

  await requireBoardPermission(userId, boardId, 'column:view');

  const columns = await prisma.column.findMany({
    where: { boardId },
    orderBy: { order: 'asc' },
    include: {
      _count: { select: { tasks: true } },
    },
  });

  return NextResponse.json(columns);
});

/**
 * POST /api/boards/[boardId]/columns
 * Create a new column at the end (or at a specified position).
 */
export const POST = withAuth<{ boardId: string }>(async (req, { params, userId }) => {
  const { boardId } = params;

  await requireBoardPermission(userId, boardId, 'column:create');

  const body = await req.json();
  const { title } = body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return NextResponse.json(
      { error: 'Column title is required' },
      { status: 400 }
    );
  }

  // Get the current max order to append at end
  const maxOrder = await prisma.column.aggregate({
    where: { boardId },
    _max: { order: true },
  });
  const nextOrder = (maxOrder._max.order ?? -1) + 1;

  const column = await prisma.column.create({
    data: {
      title: title.trim(),
      boardId,
      order: nextOrder,
    },
  });

  return NextResponse.json(column, { status: 201 });
});
