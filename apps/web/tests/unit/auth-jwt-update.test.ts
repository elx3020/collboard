import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = { user: { findUnique: vi.fn() } };

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@auth/prisma-adapter', () => ({ PrismaAdapter: () => ({}) }));
vi.mock('@/lib/auth/tokens', () => ({
  createRefreshToken: vi.fn(),
  rotateRefreshToken: vi.fn(),
}));

const { authOptions } = await import('@/lib/auth/auth-options');

beforeEach(() => {
  vi.clearAllMocks();
});

/* eslint-disable @typescript-eslint/no-explicit-any */
const jwt = authOptions.callbacks!.jwt! as (args: any) => Promise<any>;

function freshToken() {
  return {
    id: 'user-1',
    email: 'ada@example.com',
    name: 'Ada',
    // Still well inside the 15-minute access-token window, so the callback's
    // early return would otherwise skip any update.
    accessTokenExpires: Date.now() + 10 * 60 * 1000,
  };
}

describe('jwt callback — update trigger', () => {
  it('refreshes the name from the database on an update trigger', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ name: 'Ada Lovelace' });

    const result = await jwt({ token: freshToken(), trigger: 'update' });

    expect(result.name).toBe('Ada Lovelace');
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { name: true },
    });
  });

  it('ignores a name supplied by the client and uses the stored one', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ name: 'Ada Lovelace' });

    const result = await jwt({
      token: freshToken(),
      trigger: 'update',
      session: { name: 'Administrator' },
    });

    expect(result.name).toBe('Ada Lovelace');
  });

  it('leaves the token alone when there is no update trigger', async () => {
    const result = await jwt({ token: freshToken() });

    expect(result.name).toBe('Ada');
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('keeps the existing name if the user row has vanished', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const result = await jwt({ token: freshToken(), trigger: 'update' });

    expect(result.name).toBe('Ada');
  });
});
