import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Archived tasks are excluded by the server, not hidden by the client, so the
 * board query's `where` clause is the whole contract.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockPrisma = {
  board: { findUnique: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

const mockSession = { user: { id: 'user-1', email: 'ada@example.com', name: 'Ada' } };
vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(() => Promise.resolve(mockSession)),
}));
vi.mock('@/lib/auth/auth-options', () => ({ authOptions: {} }));

beforeEach(() => {
  vi.clearAllMocks();
  // Serves both the permission lookup (ownerId/members) and the board fetch.
  mockPrisma.board.findUnique.mockResolvedValue({
    id: 'board-1',
    title: 'Roadmap',
    ownerId: 'user-1',
    members: [],
    columns: [],
  });
});

const ctx = () => ({ params: Promise.resolve({ boardId: 'board-1' }) }) as never;

const request = (query = '') =>
  new Request(`http://localhost/api/boards/board-1${query}`) as never;

/** The board fetch is the only call carrying `include`; the rest are auth. */
function boardFetch() {
  return mockPrisma.board.findUnique.mock.calls.map((c: any) => c[0]).filter((a: any) => a?.include);
}

/** The `where` Prisma was asked to apply to the nested tasks. */
function taskWhere() {
  return boardFetch().at(-1).include.columns.include.tasks.where;
}

describe('GET /api/boards/[boardId] — status filter', () => {
  it('hides archived tasks when no filter is given', async () => {
    const { GET } = await import('@/app/api/boards/[boardId]/route');
    const res = await GET(request(), ctx());

    expect(res.status).toBe(200);
    expect(taskWhere()).toEqual({ status: { not: 'ARCHIVED' } });
  });

  it('returns only archived tasks when asked for them', async () => {
    const { GET } = await import('@/app/api/boards/[boardId]/route');
    await GET(request('?status=ARCHIVED'), ctx());

    expect(taskWhere()).toEqual({ status: 'ARCHIVED' });
  });

  it('returns only completed tasks when asked for them', async () => {
    const { GET } = await import('@/app/api/boards/[boardId]/route');
    await GET(request('?status=COMPLETED'), ctx());

    expect(taskWhere()).toEqual({ status: 'COMPLETED' });
  });

  it('rejects an unknown status without querying the board', async () => {
    const { GET } = await import('@/app/api/boards/[boardId]/route');
    const res = await GET(request('?status=SOMEDAY'), ctx());

    expect(res.status).toBe(400);
    expect(boardFetch()).toHaveLength(0);
  });
});
