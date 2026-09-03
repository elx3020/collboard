import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/api-guard';
import { requireBoardPermission, checkBoardPermission } from '@/lib/auth/rbac';
import { publishEvent, CHANNELS, EventType } from '@/lib/redis';
import { logger } from '@/lib/logger';

/**
 * PATCH /api/boards/[boardId]/tasks/[taskId]/comments/[commentId]
 * Edit a comment. Users can edit their own comments (VIEWER+).
 */
export const PATCH = withAuth<{ boardId: string; taskId: string; commentId: string }>(async (req, { params, userId }) => {
  const { boardId, taskId, commentId } = params;

  await requireBoardPermission(userId, boardId, 'comment:view');

  const comment = await prisma.comment.findFirst({
    where: { id: commentId, taskId },
  });

  if (!comment) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
  }

  // Only the comment author can edit their own comment
  if (comment.userId !== userId) {
    return NextResponse.json(
      { error: 'You can only edit your own comments' },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { content } = body;

  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return NextResponse.json(
      { error: 'Comment content is required' },
      { status: 400 }
    );
  }

  const updated = await prisma.comment.update({
    where: { id: commentId },
    data: { content: content.trim() },
    include: {
      user: {
        select: { id: true, name: true, email: true, image: true },
      },
    },
  });

  try {
    await publishEvent(CHANNELS.BOARD(boardId), {
      type: EventType.COMMENT_UPDATED,
      data: { comment: updated },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to publish comment updated event');
  }

  return NextResponse.json(updated);
});

/**
 * DELETE /api/boards/[boardId]/tasks/[taskId]/comments/[commentId]
 * Delete a comment. Authors can delete their own; EDITOR+ can delete any.
 */
export const DELETE = withAuth<{ boardId: string; taskId: string; commentId: string }>(async (_req, { params, userId }) => {
  const { boardId, taskId, commentId } = params;

  await requireBoardPermission(userId, boardId, 'comment:view');

  const comment = await prisma.comment.findFirst({
    where: { id: commentId, taskId },
  });

  if (!comment) {
    return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
  }

  // Authors can delete their own comments
  if (comment.userId !== userId) {
    // Non-authors need EDITOR+ permission
    const canDeleteAny = await checkBoardPermission(
      userId,
      boardId,
      'comment:delete-any'
    );
    if (!canDeleteAny) {
      return NextResponse.json(
        { error: 'You can only delete your own comments' },
        { status: 403 }
      );
    }
  }

  await prisma.comment.delete({ where: { id: commentId } });

  try {
    await publishEvent(CHANNELS.BOARD(boardId), {
      type: EventType.COMMENT_DELETED,
      data: { commentId },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to publish comment deleted event');
  }

  return NextResponse.json({ message: 'Comment deleted' });
});
