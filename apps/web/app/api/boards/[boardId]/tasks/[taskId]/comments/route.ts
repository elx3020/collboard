import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/api-guard';
import { requireBoardPermission } from '@/lib/auth/rbac';

/**
 * GET /api/boards/[boardId]/tasks/[taskId]/comments
 * List all comments on a task.
 */
export const GET = withAuth<{ boardId: string; taskId: string }>(async (_req, { params, userId }) => {
  const { boardId, taskId } = params;

  await requireBoardPermission(userId, boardId, 'comment:view');

  // Verify task belongs to this board
  const task = await prisma.task.findFirst({
    where: { id: taskId, column: { boardId } },
    select: { id: true },
  });

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  const comments = await prisma.comment.findMany({
    where: { taskId },
    include: {
      user: {
        select: { id: true, name: true, email: true, image: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(comments);
});

/**
 * POST /api/boards/[boardId]/tasks/[taskId]/comments
 * Add a comment to a task. Viewers can comment.
 */
export const POST = withAuth<{ boardId: string; taskId: string }>(async (req, { params, userId }) => {
  const { boardId, taskId } = params;

  await requireBoardPermission(userId, boardId, 'comment:create');

  const body = await req.json();
  const { content } = body;

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return NextResponse.json(
      { error: 'Comment content is required' },
      { status: 400 }
    );
  }

  // Verify task belongs to this board
  const task = await prisma.task.findFirst({
    where: { id: taskId, column: { boardId } },
    select: { id: true },
  });

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  }

  const comment = await prisma.comment.create({
    data: {
      content: content.trim(),
      taskId,
      userId,
    },
    include: {
      user: {
        select: { id: true, name: true, email: true, image: true },
      },
    },
  });

  return NextResponse.json(comment, { status: 201 });
});
