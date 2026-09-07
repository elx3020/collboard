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

vi.mock('@/lib/auth/password', () => ({
  verifyPassword: vi.fn((plain: string, hash: string) =>
    Promise.resolve(hash === `hashed:${plain}`),
  ),
}));

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

describe('PUT /api/user/notification-preferences', () => {
  function request(body: unknown) {
    return new Request('http://localhost/api/user/notification-preferences', {
      method: 'PUT',
      body: JSON.stringify(body),
    }) as never;
  }

  it('replaces the whole muted array', async () => {
    mockPrisma.user.update.mockResolvedValue({
      mutedNotificationTypes: ['TASK_COMMENTED', 'BOARD_TASK_ADDED'],
    });

    const { PUT } = await import('@/app/api/user/notification-preferences/route');
    const res = await PUT(
      request({ mutedTypes: ['TASK_COMMENTED', 'BOARD_TASK_ADDED'] }),
      ctx,
    );

    expect(res.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { mutedNotificationTypes: ['TASK_COMMENTED', 'BOARD_TASK_ADDED'] },
      select: { mutedNotificationTypes: true },
    });
  });

  it('accepts an empty array as "mute nothing"', async () => {
    mockPrisma.user.update.mockResolvedValue({ mutedNotificationTypes: [] });

    const { PUT } = await import('@/app/api/user/notification-preferences/route');
    const res = await PUT(request({ mutedTypes: [] }), ctx);

    expect(res.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { mutedNotificationTypes: [] } }),
    );
  });

  it('deduplicates repeated types', async () => {
    mockPrisma.user.update.mockResolvedValue({ mutedNotificationTypes: ['TASK_ASSIGNED'] });

    const { PUT } = await import('@/app/api/user/notification-preferences/route');
    await PUT(request({ mutedTypes: ['TASK_ASSIGNED', 'TASK_ASSIGNED'] }), ctx);

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { mutedNotificationTypes: ['TASK_ASSIGNED'] } }),
    );
  });

  it('rejects a value outside the enum without writing', async () => {
    const { PUT } = await import('@/app/api/user/notification-preferences/route');
    const res = await PUT(request({ mutedTypes: ['TASK_DELETD'] }), ctx);

    expect(res.status).toBe(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects a non-array body without writing', async () => {
    const { PUT } = await import('@/app/api/user/notification-preferences/route');
    const res = await PUT(request({ mutedTypes: 'TASK_ASSIGNED' }), ctx);

    expect(res.status).toBe(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/user', () => {
  function request(body: unknown) {
    return new Request('http://localhost/api/user', {
      method: 'DELETE',
      body: JSON.stringify(body),
    }) as never;
  }

  it('deletes the account when the password is correct', async () => {
    session.user.id = 'delete-ok';
    mockPrisma.user.findUnique.mockResolvedValue({
      email: 'ada@example.com',
      password: 'hashed:CorrectHorse1!',
    });
    mockPrisma.user.delete.mockResolvedValue({});

    const { DELETE } = await import('@/app/api/user/route');
    const res = await DELETE(request({ password: 'CorrectHorse1!' }), ctx);

    expect(res.status).toBe(200);
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 'delete-ok' } });
  });

  it('refuses a wrong password and deletes nothing', async () => {
    session.user.id = 'delete-wrong-password';
    mockPrisma.user.findUnique.mockResolvedValue({
      email: 'ada@example.com',
      password: 'hashed:CorrectHorse1!',
    });

    const { DELETE } = await import('@/app/api/user/route');
    const res = await DELETE(request({ password: 'WrongPassword1!' }), ctx);

    expect(res.status).toBe(401);
    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
  });

  it('accepts a matching email for an account with no password', async () => {
    session.user.id = 'delete-oauth';
    mockPrisma.user.findUnique.mockResolvedValue({
      email: 'ada@example.com',
      password: null,
    });
    mockPrisma.user.delete.mockResolvedValue({});

    const { DELETE } = await import('@/app/api/user/route');
    const res = await DELETE(request({ confirmEmail: '  ADA@example.com ' }), ctx);

    expect(res.status).toBe(200);
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 'delete-oauth' } });
  });

  it('refuses a mismatched email and deletes nothing', async () => {
    session.user.id = 'delete-wrong-email';
    mockPrisma.user.findUnique.mockResolvedValue({
      email: 'ada@example.com',
      password: null,
    });

    const { DELETE } = await import('@/app/api/user/route');
    const res = await DELETE(request({ confirmEmail: 'someone@else.com' }), ctx);

    expect(res.status).toBe(401);
    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
  });

  it('refuses an email confirmation when the account has a password', async () => {
    session.user.id = 'delete-wrong-proof';
    mockPrisma.user.findUnique.mockResolvedValue({
      email: 'ada@example.com',
      password: 'hashed:CorrectHorse1!',
    });

    const { DELETE } = await import('@/app/api/user/route');
    const res = await DELETE(request({ confirmEmail: 'ada@example.com' }), ctx);

    expect(res.status).toBe(401);
    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
  });

  it('rate limits repeated failed attempts by the same user', async () => {
    session.user.id = 'delete-brute-force';
    mockPrisma.user.findUnique.mockResolvedValue({
      email: 'ada@example.com',
      password: 'hashed:CorrectHorse1!',
    });

    const { DELETE } = await import('@/app/api/user/route');
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await DELETE(request({ password: 'WrongPassword1!' }), ctx);
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });
});
