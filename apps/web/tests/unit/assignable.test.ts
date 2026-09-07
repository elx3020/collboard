import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = { board: { findUnique: vi.fn() } };

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

const { assertAssignable } = await import('@/lib/boards/assignable');
const { AuthorizationError } = await import('@/lib/auth/rbac');

beforeEach(() => {
  vi.clearAllMocks();
});

/** A board owned by owner-1 with member-1 on it. */
function board() {
  return { ownerId: 'owner-1', members: [] as { role: string }[] };
}

describe('assertAssignable', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
  ])('accepts %s as unassigned without touching the database', async (_label, value) => {
    await expect(assertAssignable('board-1', value)).resolves.toBeUndefined();
    expect(mockPrisma.board.findUnique).not.toHaveBeenCalled();
  });

  it('accepts the board owner, who holds no BoardMember row', async () => {
    mockPrisma.board.findUnique.mockResolvedValue(board());

    await expect(assertAssignable('board-1', 'owner-1')).resolves.toBeUndefined();
  });

  it('accepts an EDITOR member', async () => {
    mockPrisma.board.findUnique.mockResolvedValue({
      ownerId: 'owner-1',
      members: [{ role: 'EDITOR' }],
    });

    await expect(assertAssignable('board-1', 'member-1')).resolves.toBeUndefined();
  });

  it('accepts a VIEWER member — being assigned does not require edit rights', async () => {
    mockPrisma.board.findUnique.mockResolvedValue({
      ownerId: 'owner-1',
      members: [{ role: 'VIEWER' }],
    });

    await expect(assertAssignable('board-1', 'viewer-1')).resolves.toBeUndefined();
  });

  it('rejects a user who is not on the board', async () => {
    mockPrisma.board.findUnique.mockResolvedValue(board());

    await expect(assertAssignable('board-1', 'stranger-1')).rejects.toThrow(AuthorizationError);
  });

  it('rejects with 400 — the caller is authorised, the payload is not', async () => {
    mockPrisma.board.findUnique.mockResolvedValue(board());

    await expect(assertAssignable('board-1', 'stranger-1')).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('rejects when the board does not exist', async () => {
    mockPrisma.board.findUnique.mockResolvedValue(null);

    await expect(assertAssignable('board-gone', 'member-1')).rejects.toThrow(AuthorizationError);
  });
});
