import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = {
  board: { findUnique: vi.fn() },
  task: { findUnique: vi.fn() },
  comment: { findMany: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

const { resolveRecipients } = await import('@/lib/notifications/recipients');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveRecipients', () => {
  it('notifies the assignee on TASK_ASSIGNED', async () => {
    const result = await resolveRecipients(
      { type: 'TASK_ASSIGNED', assigneeId: 'user-2' },
      'user-1',
    );
    expect(result).toEqual(['user-2']);
  });

  it('returns nobody when a user assigns a task to themselves', async () => {
    const result = await resolveRecipients(
      { type: 'TASK_ASSIGNED', assigneeId: 'user-1' },
      'user-1',
    );
    expect(result).toEqual([]);
  });

  it('returns nobody when a task is unassigned', async () => {
    const result = await resolveRecipients(
      { type: 'TASK_ASSIGNED', assigneeId: null },
      'user-1',
    );
    expect(result).toEqual([]);
  });

  it('notifies the assignee and prior commenters on TASK_COMMENTED, deduplicated', async () => {
    mockPrisma.task.findUnique.mockResolvedValue({ assigneeId: 'user-2' });
    mockPrisma.comment.findMany.mockResolvedValue([
      { userId: 'user-2' },
      { userId: 'user-3' },
      { userId: 'user-3' },
    ]);

    const result = await resolveRecipients({ type: 'TASK_COMMENTED', taskId: 'task-1' }, 'user-1');

    expect(result.sort()).toEqual(['user-2', 'user-3']);
  });

  it('never notifies the comment author, even if they are the assignee', async () => {
    mockPrisma.task.findUnique.mockResolvedValue({ assigneeId: 'user-1' });
    mockPrisma.comment.findMany.mockResolvedValue([{ userId: 'user-1' }]);

    const result = await resolveRecipients({ type: 'TASK_COMMENTED', taskId: 'task-1' }, 'user-1');

    expect(result).toEqual([]);
  });

  it('notifies the target user on BOARD_INVITED', async () => {
    const result = await resolveRecipients(
      { type: 'BOARD_INVITED', targetUserId: 'user-9' },
      'user-1',
    );
    expect(result).toEqual(['user-9']);
  });

  it('notifies owner and members on board activity, excluding the actor', async () => {
    mockPrisma.board.findUnique.mockResolvedValue({
      ownerId: 'user-1',
      members: [{ userId: 'user-2' }, { userId: 'user-3' }],
    });

    const result = await resolveRecipients({ type: 'BOARD_TASK_ADDED', boardId: 'board-1' }, 'user-1');

    expect(result.sort()).toEqual(['user-2', 'user-3']);
  });

  it('returns nobody when the board is gone', async () => {
    mockPrisma.board.findUnique.mockResolvedValue(null);

    const result = await resolveRecipients({ type: 'BOARD_TASK_REMOVED', boardId: 'board-1' }, 'user-1');

    expect(result).toEqual([]);
  });
});
