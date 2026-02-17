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
  },
  user: {
    findUnique: vi.fn(),
  },
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
        _count: { columns: 3 },
      },
    ];
    mockPrisma.board.findMany.mockResolvedValue(boards);

    const { GET } = await import('@/app/api/boards/route');
    const req = new Request('http://localhost:3000/api/boards');
    const res = await GET(req as never);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe('My Board');
    expect(body[0].currentUserRole).toBe('OWNER');
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

    // We need to mock bcrypt since it uses native bindings
    vi.doMock('bcrypt', () => ({
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
