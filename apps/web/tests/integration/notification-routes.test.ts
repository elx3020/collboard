import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = {
  notification: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    updateMany: vi.fn(),
  },
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

const mockSession = { user: { id: 'user-1', email: 'test@test.com', name: 'Test' } };

vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(() => Promise.resolve(mockSession)),
}));

vi.mock('@/lib/auth/auth-options', () => ({ authOptions: {} }));

beforeEach(() => {
  vi.clearAllMocks();
});

function row(id: string) {
  return {
    id,
    userId: 'user-1',
    type: 'TASK_COMMENTED',
    actorId: 'user-2',
    boardId: 'board-1',
    taskId: 'task-1',
    actorName: 'Ada',
    boardTitle: 'Roadmap',
    taskTitle: 'Fix login',
    meta: null,
    readAt: null,
    deleteAt: null,
    createdAt: new Date('2026-09-03T12:00:00.000Z'),
    actor: null,
  };
}

describe('GET /api/notifications', () => {
  it('returns a page scoped to the session user with the unread count', async () => {
    mockPrisma.notification.findMany.mockResolvedValue([row('n-1'), row('n-2')]);
    mockPrisma.notification.count.mockResolvedValue(2);

    const { GET } = await import('@/app/api/notifications/route');
    const res = await GET(
      new Request('http://localhost/api/notifications?limit=5') as never,
      { params: Promise.resolve({}) } as never,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.items).toHaveLength(2);
    expect(body.unreadCount).toBe(2);
    expect(body.nextCursor).toBeNull();
    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
  });

  it('returns a cursor when more rows exist than the page size', async () => {
    mockPrisma.notification.findMany.mockResolvedValue(
      ['n-1', 'n-2', 'n-3', 'n-4', 'n-5', 'n-6'].map(row),
    );
    mockPrisma.notification.count.mockResolvedValue(6);

    const { GET } = await import('@/app/api/notifications/route');
    const res = await GET(
      new Request('http://localhost/api/notifications?limit=5') as never,
      { params: Promise.resolve({}) } as never,
    );
    const body = await res.json();

    expect(body.items).toHaveLength(5);
    expect(body.nextCursor).toBe('n-5');
  });
});

describe('PATCH /api/notifications/[id]/read', () => {
  it('stamps readAt and deleteAt scoped to the session user', async () => {
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 1 });

    const { PATCH } = await import('@/app/api/notifications/[id]/read/route');
    const res = await PATCH(
      new Request('http://localhost/api/notifications/n-1/read', { method: 'PATCH' }) as never,
      { params: Promise.resolve({ id: 'n-1' }) } as never,
    );

    expect(res.status).toBe(200);

    const args = mockPrisma.notification.updateMany.mock.calls[0]?.[0];
    expect(args.where).toMatchObject({ id: 'n-1', userId: 'user-1', readAt: null });
    expect(args.data.readAt).toBeInstanceOf(Date);
    expect(args.data.deleteAt).toBeInstanceOf(Date);
  });

  it('returns 404 for a notification belonging to someone else', async () => {
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.notification.findFirst.mockResolvedValue(null);

    const { PATCH } = await import('@/app/api/notifications/[id]/read/route');
    const res = await PATCH(
      new Request('http://localhost/api/notifications/n-9/read', { method: 'PATCH' }) as never,
      { params: Promise.resolve({ id: 'n-9' }) } as never,
    );

    expect(res.status).toBe(404);
  });

  it('is idempotent for an already-read notification', async () => {
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.notification.findFirst.mockResolvedValue({ id: 'n-1' });

    const { PATCH } = await import('@/app/api/notifications/[id]/read/route');
    const res = await PATCH(
      new Request('http://localhost/api/notifications/n-1/read', { method: 'PATCH' }) as never,
      { params: Promise.resolve({ id: 'n-1' }) } as never,
    );

    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/notifications/read-all', () => {
  it('marks every unread notification of the session user', async () => {
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 4 });

    const { PATCH } = await import('@/app/api/notifications/read-all/route');
    const res = await PATCH(
      new Request('http://localhost/api/notifications/read-all', { method: 'PATCH' }) as never,
      { params: Promise.resolve({}) } as never,
    );
    const body = await res.json();

    expect(body.count).toBe(4);
    expect(mockPrisma.notification.updateMany.mock.calls[0]?.[0].where).toMatchObject({
      userId: 'user-1',
      readAt: null,
    });
  });
});
