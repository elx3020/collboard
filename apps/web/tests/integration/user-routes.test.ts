import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  board: { count: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

// Mutable so each test can use a distinct user id. Deletion is rate limited
// per user, so reusing one id across the DELETE cases would trip the limiter.
const session = { user: { id: 'user-1', email: 'ada@example.com', name: 'Ada' } };

vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(() => Promise.resolve(session)),
}));

vi.mock('@/lib/auth/auth-options', () => ({ authOptions: {} }));

beforeEach(() => {
  vi.clearAllMocks();
  session.user.id = 'user-1';
});

const ctx = { params: Promise.resolve({}) } as never;

describe('GET /api/user', () => {
  it('returns the account without ever exposing the password hash', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Ada',
      email: 'ada@example.com',
      image: null,
      password: 'hashed-secret',
      mutedNotificationTypes: ['BOARD_TASK_ADDED'],
    });
    mockPrisma.board.count.mockResolvedValue(2);

    const { GET } = await import('@/app/api/user/route');
    const res = await GET(new Request('http://localhost/api/user') as never, ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      id: 'user-1',
      name: 'Ada',
      email: 'ada@example.com',
      image: null,
      hasPassword: true,
      mutedNotificationTypes: ['BOARD_TASK_ADDED'],
      ownedBoardsWithMembers: 2,
    });
    expect(JSON.stringify(body)).not.toContain('hashed-secret');
  });

  it('reports hasPassword false for an OAuth-only account', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Ada',
      email: 'ada@example.com',
      image: null,
      password: null,
      mutedNotificationTypes: [],
    });
    mockPrisma.board.count.mockResolvedValue(0);

    const { GET } = await import('@/app/api/user/route');
    const res = await GET(new Request('http://localhost/api/user') as never, ctx);

    expect((await res.json()).hasPassword).toBe(false);
  });

  it('counts only owned boards that have another member on them', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Ada',
      email: 'ada@example.com',
      image: null,
      password: null,
      mutedNotificationTypes: [],
    });
    mockPrisma.board.count.mockResolvedValue(0);

    const { GET } = await import('@/app/api/user/route');
    await GET(new Request('http://localhost/api/user') as never, ctx);

    expect(mockPrisma.board.count).toHaveBeenCalledWith({
      where: { ownerId: 'user-1', members: { some: { userId: { not: 'user-1' } } } },
    });
  });
});

describe('PATCH /api/user', () => {
  it('trims and persists a valid name', async () => {
    mockPrisma.user.update.mockResolvedValue({
      id: 'user-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      image: null,
    });

    const { PATCH } = await import('@/app/api/user/route');
    const res = await PATCH(
      new Request('http://localhost/api/user', {
        method: 'PATCH',
        body: JSON.stringify({ name: '  Ada Lovelace  ' }),
      }) as never,
      ctx,
    );

    expect(res.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'Ada Lovelace' },
      select: { id: true, name: true, email: true, image: true },
    });
  });

  it.each([
    ['an empty name', ''],
    ['a whitespace-only name', '   '],
    ['an over-length name', 'a'.repeat(51)],
  ])('rejects %s without writing', async (_label, name) => {
    const { PATCH } = await import('@/app/api/user/route');
    const res = await PATCH(
      new Request('http://localhost/api/user', {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      }) as never,
      ctx,
    );

    expect(res.status).toBe(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});
