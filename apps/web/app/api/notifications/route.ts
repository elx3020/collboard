import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/api-guard';

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 50;

/**
 * GET /api/notifications?cursor=<id>&limit=<n>
 *
 * Newest first. Cursor-based rather than offset: new notifications arrive at
 * the head of the feed, so an offset page would skip or repeat rows.
 *
 * No RBAC check — these are own-user rows and board permissions are irrelevant
 * once a notification exists. Scoping every query by `userId` is the guard.
 */
export const GET = withAuth(async (req, { userId }) => {
  const url = new URL(req.url);
  const cursor = url.searchParams.get('cursor');
  const requested = parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit = Math.min(
    Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_LIMIT,
    MAX_LIMIT,
  );

  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1, // one extra row tells us whether another page exists
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      actor: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const unreadCount = await prisma.notification.count({ where: { userId, readAt: null } });

  return NextResponse.json({
    items,
    nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    unreadCount,
  });
});
