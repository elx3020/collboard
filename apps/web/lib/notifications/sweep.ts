import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * Deletes notifications whose retention window has closed.
 *
 * Only rows with a deleteAt are eligible, and deleteAt is set exclusively when
 * a notification is read — so an unread notification can never be swept out
 * from under someone.
 *
 * Idempotent and safe to run concurrently: if several containers sweep at once
 * the later deletes simply find fewer rows.
 */
export async function sweepExpiredNotifications(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.notification.deleteMany({
    where: { deleteAt: { lte: now } },
  });

  if (count > 0) {
    logger.info({ count }, 'Swept expired notifications');
  }

  return count;
}
