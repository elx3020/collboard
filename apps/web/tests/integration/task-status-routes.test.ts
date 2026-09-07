import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Status is the one task field a card can change without opening anything, so
 * these tests pin down what the server accepts and when it tells people.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockPrisma = {
  board: { findUnique: vi.fn() },
  task: { findFirst: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

const mockSession = { user: { id: 'user-1', email: 'ada@example.com', name: 'Ada' } };
vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(() => Promise.resolve(mockSession)),
}));
vi.mock('@/lib/auth/auth-options', () => ({ authOptions: {} }));

vi.mock('@/lib/redis', () => ({
  publishEvent: vi.fn(),
  CHANNELS: { BOARD: (id: string) => `board:${id}`, USER: (id: string) => `user:${id}` },
  EventType: { TASK_UPDATED: 'task:updated', TASK_DELETED: 'task:deleted' },
}));

const notify = vi.fn();
vi.mock('@/lib/notifications/notify', () => ({ notify: (...a: unknown[]) => notify(...a) }));

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.board.findUnique.mockResolvedValue({
    id: 'board-1',
    title: 'Roadmap',
    ownerId: 'user-1',
    members: [],
  });
  mockPrisma.user.findUnique.mockResolvedValue({ name: 'Ada' });
  // The task as it stands before the edit.
  mockPrisma.task.findFirst.mockResolvedValue({
    id: 'task-1',
    title: 'Fix login',
    columnId: 'col-1',
    assigneeId: null,
    status: 'INCOMPLETED',
    column: { boardId: 'board-1' },
  });
  mockPrisma.task.update.mockImplementation((args: any) =>
    Promise.resolve({
      id: 'task-1',
      title: 'Fix login',
      assigneeId: null,
      status: 'INCOMPLETED',
      ...args.data,
      assignee: null,
    }),
  );
});

const ctx = () => ({ params: Promise.resolve({ boardId: 'board-1', taskId: 'task-1' }) }) as never;

function patchRequest(body: unknown) {
  return new Request('http://localhost/api/boards/board-1/tasks/task-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  }) as never;
}

describe('PATCH /api/boards/[boardId]/tasks/[taskId] — status', () => {
  it('stores a valid status', async () => {
    const { PATCH } = await import('@/app/api/boards/[boardId]/tasks/[taskId]/route');
    const res = await PATCH(patchRequest({ status: 'COMPLETED' }), ctx());

    expect(res.status).toBe(200);
    expect(mockPrisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
    );
  });

  it('accepts a lowercase status, like priority does', async () => {
    const { PATCH } = await import('@/app/api/boards/[boardId]/tasks/[taskId]/route');
    await PATCH(patchRequest({ status: 'archived' }), ctx());

    expect(mockPrisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ARCHIVED' }) }),
    );
  });

  it('rejects an unknown status', async () => {
    const { PATCH } = await import('@/app/api/boards/[boardId]/tasks/[taskId]/route');
    const res = await PATCH(patchRequest({ status: 'DONE_ISH' }), ctx());

    expect(res.status).toBe(400);
    expect(mockPrisma.task.update).not.toHaveBeenCalled();
  });

  it('notifies the task audience with the new status in meta', async () => {
    const { PATCH } = await import('@/app/api/boards/[boardId]/tasks/[taskId]/route');
    await PATCH(patchRequest({ status: 'COMPLETED' }), ctx());

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        event: { type: 'TASK_STATUS_CHANGED', taskId: 'task-1' },
        actorId: 'user-1',
        taskId: 'task-1',
        taskTitle: 'Fix login',
        meta: { status: 'COMPLETED' },
      }),
    );
  });

  it('does not notify when the status is re-saved unchanged', async () => {
    const { PATCH } = await import('@/app/api/boards/[boardId]/tasks/[taskId]/route');
    await PATCH(patchRequest({ status: 'INCOMPLETED' }), ctx());

    expect(notify).not.toHaveBeenCalled();
  });

  it('does not notify on a title-only edit', async () => {
    const { PATCH } = await import('@/app/api/boards/[boardId]/tasks/[taskId]/route');
    await PATCH(patchRequest({ title: 'Fix the login bug' }), ctx());

    expect(notify).not.toHaveBeenCalled();
  });
});
