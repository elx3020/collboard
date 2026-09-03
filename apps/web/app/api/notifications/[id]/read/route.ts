import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/api-guard';
import { endOfIsoWeek } from '@/lib/utils/end-of-week';

/**
 * PATCH /api/notifications/[id]/read
 *
 * Reading is what starts the retention clock: deleteAt is the end of the ISO
 * week containing readAt, and the daily sweep in ws-server collects it then.
 *
 * The update is scoped by userId as well as id, so one user cannot mark
 * another's notifications. A miss returns 404 rather than 403 — a 403 would
 * confirm that the row exists.
 */
export const PATCH = withAuth<{ id: string }>(async (_req, { params, userId }) => {
  const { id } = params;
  const now = new Date();

  const { count } = await prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: now, deleteAt: endOfIsoWeek(now) },
  });

  if (count === 0) {
    // Either it is already read (fine, stay idempotent) or it is not ours.
    const existing = await prisma.notification.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }
  }

  return NextResponse.json({ message: 'Marked read' });
});
