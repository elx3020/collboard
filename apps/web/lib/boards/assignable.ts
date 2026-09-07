import { AuthorizationError, getUserBoardRole } from '@/lib/auth/rbac';

/**
 * Rejects an assignee who is not on the board.
 *
 * Assignment is the one place a request body carries *another* user's id, so
 * it is the one place a caller can name someone the board has never heard of.
 * Without this guard both task routes write whatever id they are handed.
 *
 * The lookup is delegated to `getUserBoardRole`, which already resolves the
 * owner — who holds no `BoardMember` row — as OWNER, and returns null for
 * anyone else. Role does not matter here: a VIEWER can be given a task to
 * look at, and being assigned grants no edit rights of its own.
 */
export async function assertAssignable(
  boardId: string,
  assigneeId: string | null | undefined,
): Promise<void> {
  // Unassigned is always valid — it is the default state of every task.
  if (!assigneeId) return;

  const role = await getUserBoardRole(assigneeId, boardId);

  if (!role) {
    // 400, not 403: the caller is authorised, their payload is not.
    throw new AuthorizationError('Assignee must be a member of this board', 400);
  }
}
