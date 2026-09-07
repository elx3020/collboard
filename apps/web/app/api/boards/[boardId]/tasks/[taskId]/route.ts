import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/api-guard';
import { requireBoardPermission } from '@/lib/auth/rbac';
import { assertAssignable } from '@/lib/boards/assignable';
import { publishEvent, CHANNELS, EventType } from '@/lib/redis';
import { logger } from '@/lib/logger';
import { notify } from '@/lib/notifications/notify';

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

const VALID_STATUSES = ['INCOMPLETED', 'COMPLETED', 'ARCHIVED'];

/**
 * The actor's name and the board's title, snapshotted onto a notification so it
 * still reads correctly after either is renamed or deleted. Fetched once per
 * request: a single PATCH can raise two notifications.
 */
async function notificationContext(userId: string, boardId: string) {
  const [actor, boardRow] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    prisma.board.findUnique({ where: { id: boardId }, select: { title: true } }),
  ]);

  return { actorName: actor?.name ?? null, boardTitle: boardRow?.title ?? null };
}

/**
 * PATCH /api/boards/[boardId]/tasks/[taskId]
 * Update task fields (title, description, priority, assigneeId, status).
 */
export const PATCH = withAuth<{ boardId: string; taskId: string }>(async (req, { params, userId }) => {
  const { boardId, taskId } = params;

  await requireBoardPermission(userId, boardId, 'task:edit');

  const existing = await getTaskForBoard(taskId, boardId);
  if (!existing) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  const body = await req.json();
  const { title, description, priority, assigneeId, status } = body;

  // Only when assignment is actually part of this edit: a title-only PATCH
  // must not demand task:assign.
  if (assigneeId !== undefined) {
    if (assigneeId) {
      await requireBoardPermission(userId, boardId, 'task:assign');
    }
    await assertAssignable(boardId, assigneeId);
  }

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

  if (status !== undefined) {
    if (typeof status !== 'string' || !VALID_STATUSES.includes(status.toUpperCase())) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }
    data.status = status.toUpperCase();
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

  try {
    await publishEvent(CHANNELS.BOARD(boardId), {
      type: EventType.TASK_UPDATED,
      data: { task },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to publish task updated event');
  }

  // Only a real change is worth a notification: title and priority edits are
  // not, and re-saving the same value must not re-notify.
  const newAssigneeId =
    assigneeId !== undefined && task.assigneeId && task.assigneeId !== existing.assigneeId
      ? task.assigneeId
      : null;
  const newStatus =
    status !== undefined && task.status !== existing.status ? task.status : null;

  if (newAssigneeId || newStatus) {
    const context = await notificationContext(userId, boardId);
    const base = {
      actorId: userId,
      ...context,
      boardId,
      taskId: task.id,
      taskTitle: task.title,
    };

    if (newAssigneeId) {
      await notify({ ...base, event: { type: 'TASK_ASSIGNED', assigneeId: newAssigneeId } });
    }

    if (newStatus) {
      await notify({
        ...base,
        event: { type: 'TASK_STATUS_CHANGED', taskId: task.id },
        meta: { status: newStatus },
      });
    }
  }

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

  try {
    await publishEvent(CHANNELS.BOARD(boardId), {
      type: EventType.TASK_DELETED,
      data: { taskId },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to publish task deleted event');
  }

  const context = await notificationContext(userId, boardId);

  await notify({
    event: { type: 'BOARD_TASK_REMOVED', boardId },
    actorId: userId,
    ...context,
    boardId,
    // The task is gone, so the notification links to the board instead.
    taskId: null,
    taskTitle: existing.title,
  });

  return NextResponse.json({ message: 'Task deleted' });
});
