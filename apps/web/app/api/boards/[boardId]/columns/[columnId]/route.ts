import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/api-guard';
import { requireBoardPermission } from '@/lib/auth/rbac';

/**
 * PATCH /api/boards/[boardId]/columns/[columnId]
 * Update a column's title.
 */
export const PATCH = withAuth<{ boardId: string; columnId: string }>(async (req, { params, userId }) => {
  const { boardId, columnId } = params;

  await requireBoardPermission(userId, boardId, 'column:edit');

  const body = await req.json();
  const { title } = body;

  if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0)) {
    return NextResponse.json(
      { error: 'Column title cannot be empty' },
      { status: 400 }
    );
  }

  // Verify column belongs to this board
  const existing = await prisma.column.findFirst({
    where: { id: columnId, boardId },
  });

  if (!existing) {
    return NextResponse.json(
      { error: 'Column not found' },
      { status: 404 }
    );
  }

  const column = await prisma.column.update({
    where: { id: columnId },
    data: { title: title.trim() },
  });

  return NextResponse.json(column);
});

/**
 * DELETE /api/boards/[boardId]/columns/[columnId]
 * Delete a column and all its tasks.
 */
export const DELETE = withAuth<{ boardId: string; columnId: string }>(async (_req, { params, userId }) => {
  const { boardId, columnId } = params;

  await requireBoardPermission(userId, boardId, 'column:delete');

  // Verify column belongs to this board
  const existing = await prisma.column.findFirst({
    where: { id: columnId, boardId },
  });

  if (!existing) {
    return NextResponse.json(
      { error: 'Column not found' },
      { status: 404 }
    );
  }

  await prisma.column.delete({ where: { id: columnId } });

  // Re-order remaining columns to close the gap
  const remaining = await prisma.column.findMany({
    where: { boardId },
    orderBy: { order: 'asc' },
  });

  await Promise.all(
    remaining.map((col, idx) =>
      prisma.column.update({
        where: { id: col.id },
        data: { order: idx },
      })
    )
  );

  return NextResponse.json({ message: 'Column deleted' });
});
