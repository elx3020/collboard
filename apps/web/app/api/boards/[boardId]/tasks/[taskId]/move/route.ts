import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/api-guard';
import { requireBoardPermission } from '@/lib/auth/rbac';

/**
 * PATCH /api/boards/[boardId]/tasks/[taskId]/move
 * Move a task to a different column and/or reorder within a column.
 * Body: { columnId: string, order: number }
 */
export const PATCH = withAuth<{ boardId: string; taskId: string }>(async (req, { params, userId }) => {
  const { boardId, taskId } = params;

  await requireBoardPermission(userId, boardId, 'task:move');

  const body = await req.json();
  const { columnId, order } = body as { columnId: string; order: number };

  if (!columnId || order === undefined || order === null) {
    return NextResponse.json(
      { error: 'columnId and order are required' },
      { status: 400 }
    );
  }

  // Verify task belongs to this board
  const task = await prisma.task.findFirst({
    where: { id: taskId, column: { boardId } },
  });

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  // Verify target column belongs to this board
  const targetColumn = await prisma.column.findFirst({
    where: { id: columnId, boardId },
  });

  if (!targetColumn) {
    return NextResponse.json(
      { error: 'Target column not found in this board' },
      { status: 404 }
    );
  }

  const oldColumnId = task.columnId;
  const isSameColumn = oldColumnId === columnId;

  await prisma.$transaction(async (tx) => {
    if (isSameColumn) {
      // Reorder within the same column
      // Remove from old position
      await tx.task.updateMany({
        where: {
          columnId,
          order: { gt: task.order },
        },
        data: { order: { decrement: 1 } },
      });

      // Insert at new position
      await tx.task.updateMany({
        where: {
          columnId,
          order: { gte: order },
          id: { not: taskId },
        },
        data: { order: { increment: 1 } },
      });
    } else {
      // Close gap in source column
      await tx.task.updateMany({
        where: {
          columnId: oldColumnId,
          order: { gt: task.order },
        },
        data: { order: { decrement: 1 } },
      });

      // Make space in target column
      await tx.task.updateMany({
        where: {
          columnId,
          order: { gte: order },
        },
        data: { order: { increment: 1 } },
      });
    }

    // Move the task
    await tx.task.update({
      where: { id: taskId },
      data: { columnId, order },
    });
  });

  const updated = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      assignee: {
        select: { id: true, name: true, email: true, image: true },
      },
      column: {
        select: { id: true, title: true },
      },
    },
  });

  return NextResponse.json(updated);
});
