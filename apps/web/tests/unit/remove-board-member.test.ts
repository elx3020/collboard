import { describe, it, expect, vi, beforeEach } from 'vitest';

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockPrisma = {
  boardMember: { delete: vi.fn() },
  task: { updateMany: vi.fn() },
  // The real client runs the callback with a transactional client; passing the
  // same mock through keeps the assertions on the calls themselves.
  $transaction: vi.fn((fn: any) => fn(mockPrisma)),
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

const { removeBoardMember } = await import('@/lib/auth/rbac');

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation((fn: any) => fn(mockPrisma));
});

describe('removeBoardMember', () => {
  it('deletes the membership row', async () => {
    await removeBoardMember('board-1', 'member-1');

    expect(mockPrisma.boardMember.delete).toHaveBeenCalledWith({
      where: { boardId_userId: { boardId: 'board-1', userId: 'member-1' } },
    });
  });

  it('clears that person from tasks on the board they are leaving', async () => {
    await removeBoardMember('board-1', 'member-1');

    expect(mockPrisma.task.updateMany).toHaveBeenCalledWith({
      where: { assigneeId: 'member-1', column: { boardId: 'board-1' } },
      data: { assigneeId: null },
    });
  });

  it('scopes the unassign to one board, leaving their other boards alone', async () => {
    await removeBoardMember('board-1', 'member-1');

    const where = mockPrisma.task.updateMany.mock.calls[0]![0].where;
    expect(where.column).toEqual({ boardId: 'board-1' });
  });

  it('does both in one transaction, so a board never keeps an orphaned assignment', async () => {
    await removeBoardMember('board-1', 'member-1');

    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
