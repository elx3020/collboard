import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/api-guard';
import { endOfIsoWeek } from '@/lib/utils/end-of-week';

/**
 * PATCH /api/notifications/read-all
 *
 * The escape valve. Because reads are per-click, a notification nobody clicks
 * never gets a deleteAt and so never expires; without this the feed would grow
 * without bound for anyone who ignores it.
 */
export const PATCH = withAuth(async (_req, { userId }) => {
  const now = new Date();

  const { count } = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: now, deleteAt: endOfIsoWeek(now) },
  });

  return NextResponse.json({ count });
});
