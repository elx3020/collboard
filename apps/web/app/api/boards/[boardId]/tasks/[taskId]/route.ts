import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/api-guard';
import { requireBoardPermission } from '@/lib/auth/rbac';

/**
 * Helper: get a task and verify it belongs to the given board.
 */
async function getTaskForBoard(taskId: string, boardId: string) {
  return prisma.task.findFirst({
    where: {
      id: taskId,
      column: { boardId },
    },
    include: {
      column: { select: { boardId: true } },
    },
  });
}

/**
 * GET /api/boards/[boardId]/tasks/[taskId]
 * Get a single task with all details.
 */
export const GET = withAuth<{ boardId: string; taskId: string }>(async (_req, { params, userId }) => {
  const { boardId, taskId } = params;

  await requireBoardPermission(userId, boardId, 'task:view');

  const task = await prisma.task.findFirst({
    where: {
      id: taskId,
      column: { boardId },
    },
    include: {
      assignee: {
        select: { id: true, name: true, email: true, image: true },
      },
      column: {
        select: { id: true, title: true },
      },
      comments: {
        include: {
          user: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  return NextResponse.json(task);
});

/**
 * PATCH /api/boards/[boardId]/tasks/[taskId]
 * Update task fields (title, description, priority, assigneeId).
 */
export const PATCH = withAuth<{ boardId: string; taskId: string }>(async (req, { params, userId }) => {
  const { boardId, taskId } = params;

  await requireBoardPermission(userId, boardId, 'task:edit');

  const existing = await getTaskForBoard(taskId, boardId);
  if (!existing) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  const body = await req.json();
  const { title, description, priority, assigneeId } = body;

  const data: Record<string, unknown> = {};

  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json(
        { error: 'Task title cannot be empty' },
        { status: 400 }
      );
    }
    data.title = title.trim();
  }

  if (description !== undefined) {
    data.description = description?.trim() || null;
  }

  if (priority !== undefined) {
    const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
    if (!validPriorities.includes(priority?.toUpperCase())) {
      return NextResponse.json(
        { error: `Invalid priority. Must be one of: ${validPriorities.join(', ')}` },
        { status: 400 }
      );
    }
    data.priority = priority.toUpperCase();
  }

  if (assigneeId !== undefined) {
    data.assigneeId = assigneeId || null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: 'No fields to update' },
      { status: 400 }
    );
  }

  const task = await prisma.task.update({
    where: { id: taskId },
    data,
    include: {
      assignee: {
        select: { id: true, name: true, email: true, image: true },
      },
      column: {
        select: { id: true, title: true },
      },
    },
  });

  return NextResponse.json(task);
});

/**
 * DELETE /api/boards/[boardId]/tasks/[taskId]
 * Delete a task.
 */
export const DELETE = withAuth<{ boardId: string; taskId: string }>(async (_req, { params, userId }) => {
  const { boardId, taskId } = params;

  await requireBoardPermission(userId, boardId, 'task:delete');

  const existing = await getTaskForBoard(taskId, boardId);
  if (!existing) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  await prisma.task.delete({ where: { id: taskId } });

  // Re-order remaining tasks in the column
  const remaining = await prisma.task.findMany({
    where: { columnId: existing.columnId },
    orderBy: { order: 'asc' },
  });

  await Promise.all(
    remaining.map((t, idx) =>
      prisma.task.update({
        where: { id: t.id },
        data: { order: idx },
      })
    )
  );

  return NextResponse.json({ message: 'Task deleted' });
});
