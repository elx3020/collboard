import type { Board } from '@/lib/types';

export type BoardGroupKey = 'owned' | 'sharedByMe' | 'sharedWithMe';

export interface GroupedBoards {
  owned: Board[];
  sharedByMe: Board[];
  sharedWithMe: Board[];
}

/**
 * Partition boards into three disjoint groups. Every board lands in exactly
 * one group.
 *
 * Board owners have no BoardMember row (they are implicitly OWNER), so
 * `_count.members` is already the non-owner member count.
 */
export function groupBoards(
  boards: Board[],
  currentUserId: string
): GroupedBoards {
  const grouped: GroupedBoards = {
    owned: [],
    sharedByMe: [],
    sharedWithMe: [],
  };

  for (const board of boards) {
    if (board.ownerId !== currentUserId) {
      grouped.sharedWithMe.push(board);
    } else if ((board._count?.members ?? 0) > 0) {
      grouped.sharedByMe.push(board);
    } else {
      grouped.owned.push(board);
    }
  }

  return grouped;
}
