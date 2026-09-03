import { prisma } from '@/lib/prisma';

/**
 * The events that produce notifications.
 *
 * There is deliberately no task-move variant: board activity fans out to every
 * member, and most drags are reordering within a column, which carries no
 * information anyone needs. Moves stay a board *sync* event (`task:moved`).
 */
export type NotifyEvent =
  | { type: 'TASK_ASSIGNED'; assigneeId: string | null }
  | { type: 'TASK_COMMENTED'; taskId: string }
  | { type: 'BOARD_INVITED'; targetUserId: string }
  | { type: 'BOARD_ROLE_CHANGED'; targetUserId: string }
  | { type: 'BOARD_TASK_ADDED'; boardId: string }
  | { type: 'BOARD_TASK_REMOVED'; boardId: string };

/** Everyone with access to a board: its members plus its owner. */
async function boardAudience(boardId: string): Promise<string[]> {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: { ownerId: true, members: { select: { userId: true } } },
  });

  if (!board) return [];

  return [board.ownerId, ...board.members.map((m) => m.userId)];
}

/** Everyone already involved in a task: its assignee plus anyone who has commented. */
async function taskAudience(taskId: string): Promise<string[]> {
  const [task, commenters] = await Promise.all([
    prisma.task.findUnique({ where: { id: taskId }, select: { assigneeId: true } }),
    prisma.comment.findMany({
      where: { taskId },
      select: { userId: true },
      distinct: ['userId'],
    }),
  ]);

  return [
    ...(task?.assigneeId ? [task.assigneeId] : []),
    ...commenters.map((c) => c.userId),
  ];
}

/**
 * Resolves an event to the user ids that should receive a notification.
 *
 * The actor is always excluded and the result is deduplicated, so a person is
 * never told about their own action and never gets the same event twice.
 */
export async function resolveRecipients(
  event: NotifyEvent,
  actorId: string,
): Promise<string[]> {
  let candidates: string[];

  switch (event.type) {
    case 'TASK_ASSIGNED':
      candidates = event.assigneeId ? [event.assigneeId] : [];
      break;
    case 'TASK_COMMENTED':
      candidates = await taskAudience(event.taskId);
      break;
    case 'BOARD_INVITED':
    case 'BOARD_ROLE_CHANGED':
      candidates = [event.targetUserId];
      break;
    case 'BOARD_TASK_ADDED':
    case 'BOARD_TASK_REMOVED':
      candidates = await boardAudience(event.boardId);
      break;
  }

  return [...new Set(candidates)].filter((id) => id !== actorId);
}
