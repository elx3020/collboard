import { describe, it, expect } from 'vitest';
import { groupBoards } from '@/lib/boards/group-boards';
import type { Board } from '@/lib/types';

const ME = 'user-me';
const OTHER = 'user-other';

/** Builds a Board with only the fields the grouping cares about. */
function makeBoard(
  id: string,
  ownerId: string,
  memberCount: number
): Board {
  return {
    id,
    title: `Board ${id}`,
    description: null,
    ownerId,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    owner: { id: ownerId, name: null, email: 'owner@example.com', image: null },
    members: [],
    columns: [],
    _count: { columns: 0, members: memberCount },
  };
}

describe('groupBoards', () => {
  it('puts a board I own with no members in "owned"', () => {
    const result = groupBoards([makeBoard('b1', ME, 0)], ME);

    expect(result.owned.map((b) => b.id)).toEqual(['b1']);
    expect(result.sharedByMe).toEqual([]);
    expect(result.sharedWithMe).toEqual([]);
  });

  it('puts a board I own that has members in "sharedByMe"', () => {
    const result = groupBoards([makeBoard('b2', ME, 3)], ME);

    expect(result.sharedByMe.map((b) => b.id)).toEqual(['b2']);
    expect(result.owned).toEqual([]);
  });

  it('puts a board someone else owns in "sharedWithMe"', () => {
    const result = groupBoards([makeBoard('b3', OTHER, 2)], ME);

    expect(result.sharedWithMe.map((b) => b.id)).toEqual(['b3']);
    expect(result.owned).toEqual([]);
    expect(result.sharedByMe).toEqual([]);
  });

  it('never places one board in two groups', () => {
    const boards = [
      makeBoard('b1', ME, 0),
      makeBoard('b2', ME, 3),
      makeBoard('b3', OTHER, 2),
      makeBoard('b4', OTHER, 0),
    ];

    const result = groupBoards(boards, ME);
    const all = [...result.owned, ...result.sharedByMe, ...result.sharedWithMe];

    expect(all).toHaveLength(4);
    expect(new Set(all.map((b) => b.id)).size).toBe(4);
  });

  it('treats a missing _count as zero members', () => {
    const board = makeBoard('b5', ME, 0);
    delete board._count;

    const result = groupBoards([board], ME);

    expect(result.owned.map((b) => b.id)).toEqual(['b5']);
  });

  it('preserves the input order within each group', () => {
    const boards = [
      makeBoard('first', ME, 0),
      makeBoard('second', ME, 0),
      makeBoard('third', ME, 0),
    ];

    const result = groupBoards(boards, ME);

    expect(result.owned.map((b) => b.id)).toEqual(['first', 'second', 'third']);
  });

  it('returns three empty groups for an empty list', () => {
    const result = groupBoards([], ME);

    expect(result).toEqual({ owned: [], sharedByMe: [], sharedWithMe: [] });
  });
});
