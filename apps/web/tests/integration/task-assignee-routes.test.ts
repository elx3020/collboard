import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Assignment is the one place a task request body carries another user's id,
 * so these tests are about who the server will accept as an assignee.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockPrisma = {
  board: { findUnique: vi.fn() },
  column: { findFirst: vi.fn() },
  task: {
    findFirst: vi.fn(),
    aggregate: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
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
  EventType: { TASK_CREATED: 'task:created', TASK_UPDATED: 'task:updated' },
}));

const notify = vi.fn();
vi.mock('@/lib/notifications/notify', () => ({ notify: (...a: unknown[]) => notify(...a) }));

/**
 * board-1 is owned by user-1. `memberIds` are the extra people on it.
 * getUserBoardRole scopes its members lookup by userId, so the mock keys off
 * that to answer "is this particular person on the board".
 */
function boardWith(memberIds: string[]) {
  mockPrisma.board.findUnique.mockImplementation((args: any) => {
    const target = args?.select?.members?.where?.userId;
    if (target === undefined) {
      return Promise.resolve({ id: 'board-1', title: 'Roadmap', ownerId: 'user-1' });
    }
    return Promise.resolve({
      ownerId: 'user-1',
      members: memberIds.includes(target) ? [{ role: 'EDITOR' }] : [],
    });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  boardWith(['member-1']);
  mockPrisma.user.findUnique.mockResolvedValue({ name: 'Ada' });
  mockPrisma.column.findFirst.mockResolvedValue({ id: 'col-1', boardId: 'board-1' });
  mockPrisma.task.aggregate.mockResolvedValue({ _max: { order: 0 } });
  mockPrisma.task.create.mockImplementation((args: any) =>
    Promise.resolve({ id: 'task-1', title: 'Fix login', ...args.data, assignee: null }),
  );
  mockPrisma.task.update.mockImplementation((args: any) =>
    Promise.resolve({ id: 'task-1', title: 'Fix login', ...args.data, assignee: null }),
  );
});

const ctx = (boardId = 'board-1', taskId = 'task-1') =>
  ({ params: Promise.resolve({ boardId, taskId }) }) as never;

function postRequest(body: unknown) {
  return new Request('http://localhost/api/boards/board-1/tasks', {
    method: 'POST',
    body: JSON.stringify(body),
  }) as never;
}

function patchRequest(body: unknown) {
  return new Request('http://localhost/api/boards/board-1/tasks/task-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  }) as never;
}

describe('POST /api/boards/[boardId]/tasks — assignee', () => {
  it('creates an unassigned task when no assignee is given', async () => {
    const { POST } = await import('@/app/api/boards/[boardId]/tasks/route');
    const res = await POST(postRequest({ title: 'Fix login', columnId: 'col-1' }), ctx());

    expect(res.status).toBe(201);
    expect(mockPrisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ assigneeId: null }) }),
    );
  });

  it('assigns to a board member', async () => {
    const { POST } = await import('@/app/api/boards/[boardId]/tasks/route');
    const res = await POST(
      postRequest({ title: 'Fix login', columnId: 'col-1', assigneeId: 'member-1' }),
      ctx(),
    );

    expect(res.status).toBe(201);
    expect(mockPrisma.task.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ assigneeId: 'member-1' }) }),
    );
  });

  it('assigns to the board owner, who holds no BoardMember row', async () => {
    const { POST } = await import('@/app/api/boards/[boardId]/tasks/route');
    const res = await POST(
      postRequest({ title: 'Fix login', columnId: 'col-1', assigneeId: 'user-1' }),
      ctx(),
    );

    expect(res.status).toBe(201);
  });

  it('rejects an assignee who is not on the board and creates nothing', async () => {
    const { POST } = await import('@/app/api/boards/[boardId]/tasks/route');
    const res = await POST(
      postRequest({ title: 'Fix login', columnId: 'col-1', assigneeId: 'stranger-1' }),
      ctx(),
    );

    expect(res.status).toBe(400);
    expect(mockPrisma.task.create).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/boards/[boardId]/tasks/[taskId] — assignee', () => {
  beforeEach(() => {
    mockPrisma.task.findFirst.mockResolvedValue({
      id: 'task-1',
      title: 'Fix login',
      assigneeId: null,
      column: { boardId: 'board-1' },
    });
  });

  it('assigns to a board member', async () => {
    const { PATCH } = await import('@/app/api/boards/[boardId]/tasks/[taskId]/route');
    const res = await PATCH(patchRequest({ assigneeId: 'member-1' }), ctx());

    expect(res.status).toBe(200);
    expect(mockPrisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { assigneeId: 'member-1' } }),
    );
  });

  it('clears the assignee when given null', async () => {
    const { PATCH } = await import('@/app/api/boards/[boardId]/tasks/[taskId]/route');
    const res = await PATCH(patchRequest({ assigneeId: null }), ctx());

    expect(res.status).toBe(200);
    expect(mockPrisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { assigneeId: null } }),
    );
  });

  it('rejects an assignee who is not on the board and updates nothing', async () => {
    const { PATCH } = await import('@/app/api/boards/[boardId]/tasks/[taskId]/route');
    const res = await PATCH(patchRequest({ assigneeId: 'stranger-1' }), ctx());

    expect(res.status).toBe(400);
    expect(mockPrisma.task.update).not.toHaveBeenCalled();
  });

  it('still allows a title-only edit without touching assignment', async () => {
    const { PATCH } = await import('@/app/api/boards/[boardId]/tasks/[taskId]/route');
    const res = await PATCH(patchRequest({ title: 'Renamed' }), ctx());

    expect(res.status).toBe(200);
    expect(mockPrisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { title: 'Renamed' } }),
    );
  });
});
