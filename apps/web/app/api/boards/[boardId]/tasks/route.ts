import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/api-guard';
import { requireBoardPermission } from '@/lib/auth/rbac';

/**
 * GET /api/boards/[boardId]/tasks
 * List all tasks across columns for a board, with optional filters.
 * Query params: ?assigneeId=&priority=&search=
 */
export const GET = withAuth<{ boardId: string }>(async (req, { params, userId }) => {
  const { boardId } = params;

  await requireBoardPermission(userId, boardId, 'task:view');

  const url = new URL(req.url);
  const assigneeId = url.searchParams.get('assigneeId');
  const priority = url.searchParams.get('priority');
  const search = url.searchParams.get('search');

  const where: Record<string, unknown> = {
    column: { boardId },
  };

  if (assigneeId) where.assigneeId = assigneeId;
  if (priority) where.priority = priority.toUpperCase();
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      assignee: {
        select: { id: true, name: true, email: true, image: true },
      },
      column: {
        select: { id: true, title: true },
      },
      _count: { select: { comments: true } },
    },
    orderBy: [{ column: { order: 'asc' } }, { order: 'asc' }],
  });

  return NextResponse.json(tasks);
});

/**
 * POST /api/boards/[boardId]/tasks
 * Create a new task in a specific column.
 */
export const POST = withAuth<{ boardId: string }>(async (req, { params, userId }) => {
  const { boardId } = params;

  await requireBoardPermission(userId, boardId, 'task:create');

  const body = await req.json();
  const { title, description, columnId, assigneeId, priority } = body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return NextResponse.json(
      { error: 'Task title is required' },
      { status: 400 }
    );
  }

  if (!columnId) {
    return NextResponse.json(
      { error: 'columnId is required' },
      { status: 400 }
    );
  }

  // Verify column belongs to this board
  const column = await prisma.column.findFirst({
    where: { id: columnId, boardId },
  });

  if (!column) {
    return NextResponse.json(
      { error: 'Column not found in this board' },
      { status: 404 }
    );
  }

  // Get max order for the target column
  const maxOrder = await prisma.task.aggregate({
    where: { columnId },
    _max: { order: true },
  });
  const nextOrder = (maxOrder._max.order ?? -1) + 1;

  const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
  const taskPriority =
    priority && validPriorities.includes(priority.toUpperCase())
      ? priority.toUpperCase()
      : 'MEDIUM';

  const task = await prisma.task.create({
    data: {
      title: title.trim(),
      description: description?.trim() || null,
      columnId,
      order: nextOrder,
      assigneeId: assigneeId || null,
      priority: taskPriority,
    },
    include: {
      assignee: {
        select: { id: true, name: true, email: true, image: true },
      },
      column: {
        select: { id: true, title: true },
      },
    },
  });

  return NextResponse.json(task, { status: 201 });
});
