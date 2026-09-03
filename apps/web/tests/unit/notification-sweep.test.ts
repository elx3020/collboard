import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = {
  notification: { deleteMany: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

const { sweepExpiredNotifications } = await import('@/lib/notifications/sweep');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sweepExpiredNotifications', () => {
  it('deletes only rows whose deleteAt has passed', async () => {
    mockPrisma.notification.deleteMany.mockResolvedValue({ count: 3 });
    const now = new Date('2026-09-13T23:59:59.999Z');

    const count = await sweepExpiredNotifications(now);

    expect(count).toBe(3);
    expect(mockPrisma.notification.deleteMany).toHaveBeenCalledWith({
      where: { deleteAt: { lte: now } },
    });
  });

  it('never touches unread notifications, which have a null deleteAt', async () => {
    mockPrisma.notification.deleteMany.mockResolvedValue({ count: 0 });

    await sweepExpiredNotifications(new Date('2026-09-13T00:00:00.000Z'));

    // `deleteAt: { lte: ... }` cannot match NULL in Postgres, so an unread row
    // is unreachable by this query. Asserting the shape is what guarantees it.
    const where = mockPrisma.notification.deleteMany.mock.calls[0]?.[0].where;
    expect(where).toEqual({ deleteAt: { lte: expect.any(Date) } });
    expect(where.deleteAt).not.toBeNull();
  });

  it('reports zero when there is nothing to collect', async () => {
    mockPrisma.notification.deleteMany.mockResolvedValue({ count: 0 });

    expect(await sweepExpiredNotifications()).toBe(0);
  });
});
