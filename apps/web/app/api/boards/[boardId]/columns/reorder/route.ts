import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/api-guard';
import { requireBoardPermission } from '@/lib/auth/rbac';

/**
 * PATCH /api/boards/[boardId]/columns/reorder
 * Reorder all columns on a board. Expects { columns: [{ id, order }] }
 */
export const PATCH = withAuth<{ boardId: string }>(async (req, { params, userId }) => {
  const { boardId } = params;

  await requireBoardPermission(userId, boardId, 'column:reorder');

  const body = await req.json();
  const { columns } = body as { columns: { id: string; order: number }[] };

  if (!Array.isArray(columns) || columns.length === 0) {
    return NextResponse.json(
      { error: 'columns array is required' },
      { status: 400 }
    );
  }

  // Validate all columns belong to this board
  const existing = await prisma.column.findMany({
    where: { boardId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((c) => c.id));

  for (const col of columns) {
    if (!existingIds.has(col.id)) {
      return NextResponse.json(
        { error: `Column ${col.id} does not belong to this board` },
        { status: 400 }
      );
    }
  }

  // Update all column orders in a transaction
  await prisma.$transaction(
    columns.map((col) =>
      prisma.column.update({
        where: { id: col.id },
        data: { order: col.order },
      })
    )
  );

  const updated = await prisma.column.findMany({
    where: { boardId },
    orderBy: { order: 'asc' },
  });

  return NextResponse.json(updated);
});
