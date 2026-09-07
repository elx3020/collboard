import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = {
  board: { findUnique: vi.fn() },
  task: { findUnique: vi.fn() },
  comment: { findMany: vi.fn() },
  user: { findMany: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

const { resolveRecipients } = await import('@/lib/notifications/recipients');

beforeEach(() => {
  vi.clearAllMocks();
  // Default: nobody has muted anything, so every candidate comes back.
  mockPrisma.user.findMany.mockImplementation(
    (args: { where: { id: { in: string[] } } }) =>
      Promise.resolve(args.where.id.in.map((id) => ({ id }))),
  );
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
  it('drops a recipient who has muted the event type', async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);

    const result = await resolveRecipients(
      { type: 'TASK_ASSIGNED', assigneeId: 'user-2' },
      'user-1',
    );

    expect(result).toEqual([]);
    expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['user-2'] },
        NOT: { mutedNotificationTypes: { has: 'TASK_ASSIGNED' } },
      },
      select: { id: true },
    });
  });

  it('filters on the event type being delivered, not a fixed one', async () => {
    mockPrisma.task.findUnique.mockResolvedValue({ assigneeId: 'user-2' });
    mockPrisma.comment.findMany.mockResolvedValue([]);

    await resolveRecipients({ type: 'TASK_COMMENTED', taskId: 'task-1' }, 'user-1');

    expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: { mutedNotificationTypes: { has: 'TASK_COMMENTED' } },
        }),
      }),
    );
  });

  it('preserves candidate order regardless of the order rows come back in', async () => {
    mockPrisma.board.findUnique.mockResolvedValue({
      ownerId: 'user-2',
      members: [{ userId: 'user-3' }, { userId: 'user-4' }],
    });
    mockPrisma.user.findMany.mockResolvedValue([
      { id: 'user-4' },
      { id: 'user-2' },
      { id: 'user-3' },
    ]);

    const result = await resolveRecipients(
      { type: 'BOARD_TASK_ADDED', boardId: 'board-1' },
      'user-1',
    );

    expect(result).toEqual(['user-2', 'user-3', 'user-4']);
  });

  it('does not query preferences when there are no candidates', async () => {
    const result = await resolveRecipients(
      { type: 'TASK_ASSIGNED', assigneeId: null },
      'user-1',
    );

    expect(result).toEqual([]);
    expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
  });
});
