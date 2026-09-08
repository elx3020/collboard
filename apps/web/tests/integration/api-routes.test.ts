import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Integration tests for API routes.
 *
 * We mock Prisma and next-auth so the tests run without a database,
 * but exercise the real route handler logic including validation,
 * auth checks, and error handling.
 */

// ── Mocks ──────────────────────────────────────────────────────────────────────

// Mock Prisma
const mockPrisma = {
  board: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  boardMember: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  $connect: vi.fn(),
  $disconnect: vi.fn(),
};

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}));

// Mock next-auth getServerSession to return an authenticated user
const mockSession = {
  user: { id: 'user-1', email: 'test@test.com', name: 'Test' },
};

vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(() => Promise.resolve(mockSession)),
}));

vi.mock('@/lib/auth/auth-options', () => ({
  authOptions: {},
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ── GET /api/boards ────────────────────────────────────────────────────────────

describe('GET /api/boards', () => {
  it('returns boards the user owns or is a member of', async () => {
    const boards = [
      {
        id: 'board-1',
        title: 'My Board',
        ownerId: 'user-1',
        owner: { id: 'user-1', name: 'Test', email: 'test@test.com', image: null },
        members: [],
        columns: [
          { id: 'col-1', title: 'To Do', _count: { tasks: 2 } },
          { id: 'col-2', title: 'Done', _count: { tasks: 1 } },
        ],
        _count: { columns: 3, members: 0 },
      },
    ];
    mockPrisma.board.findMany.mockResolvedValue(boards);
    mockPrisma.boardMember.findMany.mockResolvedValue([]);

    const { GET } = await import('@/app/api/boards/route');
    const req = new Request('http://localhost:3000/api/boards');
    const res = await GET(req as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe('My Board');
    expect(body[0].currentUserRole).toBe('OWNER');
    // The dashboard card reads per-column counts from here, not from `columns`.
    expect(body[0].columnSummaries).toEqual([
      { id: 'col-1', title: 'To Do', taskCount: 2 },
      { id: 'col-2', title: 'Done', taskCount: 1 },
    ]);
  });

  it('counts only unarchived tasks per column', async () => {
    mockPrisma.board.findMany.mockResolvedValue([]);
    mockPrisma.boardMember.findMany.mockResolvedValue([]);

    const { GET } = await import('@/app/api/boards/route');
    await GET(new Request('http://localhost:3000/api/boards') as never);

    // An archived task is hidden on the board by default, so counting it here
    // would make the card disagree with the board it links to.
    const args = mockPrisma.board.findMany.mock.calls[0]?.[0];
    expect(args.include.columns.select._count.select.tasks).toEqual({
      where: { status: { not: 'ARCHIVED' } },
    });
  });

  it('caps the member preview and keeps the roster query separate', async () => {
    mockPrisma.board.findMany.mockResolvedValue([
      {
        id: 'board-1',
        title: 'Shared',
        ownerId: 'user-9',
        owner: { id: 'user-9', name: 'Grace', email: 'g@e.com', image: null },
        members: [{ id: 'm-1', userId: 'user-1', role: 'EDITOR' }],
        columns: [],
        _count: { columns: 0, members: 6 },
      },
    ]);
    mockPrisma.boardMember.findMany.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({
        boardId: 'board-1',
        user: { id: `u${i}`, name: `User ${i}`, email: `u${i}@e.com`, image: null },
      }))
    );

    const { GET } = await import('@/app/api/boards/route');
    const res = await GET(new Request('http://localhost:3000/api/boards') as never);
    const body = await res.json();

    expect(body[0].memberPreview).toHaveLength(4);
    expect(body[0]._count.members).toBe(6);
  });

  it('selects the membership row id so a member can leave the board', async () => {
    mockPrisma.board.findMany.mockResolvedValue([]);
    mockPrisma.boardMember.findMany.mockResolvedValue([]);

    const { GET } = await import('@/app/api/boards/route');
    await GET(new Request('http://localhost:3000/api/boards') as never);

    // DELETE /members/[memberId] is keyed by the BoardMember row id. Without
    // it in this select the dashboard has no way to name the row to remove,
    // even though Board.members is typed as carrying one.
    const args = mockPrisma.board.findMany.mock.calls[0]?.[0];
    expect(args.include.members.select).toMatchObject({ id: true });
  });
});

// ── POST /api/boards ───────────────────────────────────────────────────────────

describe('POST /api/boards', () => {
  it('creates a board and returns 201', async () => {
    const created = {
      id: 'board-new',
      title: 'New Board',
      description: null,
      ownerId: 'user-1',
      columns: [],
      owner: { id: 'user-1', name: 'Test', email: 'test@test.com', image: null },
    };
    mockPrisma.board.create.mockResolvedValue(created);

    const { POST } = await import('@/app/api/boards/route');
    const req = new Request('http://localhost:3000/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New Board' }),
    });
    const res = await POST(req as never);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.title).toBe('New Board');
  });

  it('returns 400 when title is missing', async () => {
    const { POST } = await import('@/app/api/boards/route');
    const req = new Request('http://localhost:3000/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await POST(req as never);

    expect(res.status).toBe(400);
  });

  it('returns 400 when title is empty string', async () => {
    const { POST } = await import('@/app/api/boards/route');
    const req = new Request('http://localhost:3000/api/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '  ' }),
    });
    const res = await POST(req as never);

    expect(res.status).toBe(400);
  });
});

// ── POST /api/auth/register ────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  it('registers a user and returns 201', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create = vi.fn().mockResolvedValue({
      id: 'user-new',
      email: 'new@test.com',
      name: 'New User',
      createdAt: new Date().toISOString(),
    });

    // Mock bcryptjs for testing
    vi.doMock('bcryptjs', () => ({
      default: {
        hash: vi.fn(() => Promise.resolve('hashed')),
        compare: vi.fn(() => Promise.resolve(true)),
      },
    }));

    const { POST } = await import('@/app/api/auth/register/route');
    const req = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'new@test.com',
        password: 'StrongP@ss1',
        name: 'New User',
      }),
    });
    const res = await POST(req as never);

    expect(res.status).toBe(201);
  });

  it('returns 400 when email is missing', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    const req = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'StrongP@ss1' }),
    });
    const res = await POST(req as never);

    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    const { POST } = await import('@/app/api/auth/register/route');
    const req = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email', password: 'StrongP@ss1' }),
    });
    const res = await POST(req as never);

    expect(res.status).toBe(400);
  });

  it('returns 409 when user already exists', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing' });

    const { POST } = await import('@/app/api/auth/register/route');
    const req = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'existing@test.com',
        password: 'StrongP@ss1',
      }),
    });
    const res = await POST(req as never);

    expect(res.status).toBe(409);
  });
});

// ── GET /api/health ────────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('returns status ok when db is connected', async () => {
    mockPrisma.$connect = vi.fn().mockResolvedValue(undefined);
    mockPrisma.$disconnect = vi.fn().mockResolvedValue(undefined);

    vi.doMock('@/lib/prisma', () => ({
      prisma: mockPrisma,
    }));

    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.database).toBe('connected');
  });
});

// ── PATCH /api/boards/[boardId] colour validation ──────────────────────────────

describe('PATCH /api/boards/[boardId] colour', () => {
  it('accepts a colour from the palette', async () => {
    mockPrisma.board.findUnique.mockResolvedValue({
      ownerId: 'user-1',
      members: [],
    });
    mockPrisma.board.update.mockResolvedValue({
      id: 'board-1',
      title: 'Board',
      color: 'amber',
    });

    const { PATCH } = await import('@/app/api/boards/[boardId]/route');

    const req = new Request('http://localhost:3000/api/boards/board-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color: 'amber' }),
    });
    const res = await PATCH(req as never, {
      params: Promise.resolve({ boardId: 'board-1' }),
    });

    expect(res.status).toBe(200);
    expect(mockPrisma.board.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ color: 'amber' }) })
    );
  });

  it('accepts null to clear the colour', async () => {
    mockPrisma.board.findUnique.mockResolvedValue({
      ownerId: 'user-1',
      members: [],
    });
    mockPrisma.board.update.mockResolvedValue({ id: 'board-1', color: null });

    const { PATCH } = await import('@/app/api/boards/[boardId]/route');

    const req = new Request('http://localhost:3000/api/boards/board-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color: null }),
    });
    const res = await PATCH(req as never, {
      params: Promise.resolve({ boardId: 'board-1' }),
    });

    expect(res.status).toBe(200);
    expect(mockPrisma.board.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ color: null }) })
    );
  });

  it('rejects a colour outside the palette', async () => {
    mockPrisma.board.findUnique.mockResolvedValue({
      ownerId: 'user-1',
      members: [],
    });

    const { PATCH } = await import('@/app/api/boards/[boardId]/route');

    const req = new Request('http://localhost:3000/api/boards/board-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color: '#FEE35C' }),
    });
    const res = await PATCH(req as never, {
      params: Promise.resolve({ boardId: 'board-1' }),
    });

    expect(res.status).toBe(400);
    expect(mockPrisma.board.update).not.toHaveBeenCalled();
  });
});
