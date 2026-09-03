import { prisma } from '@/lib/prisma';
import { publishEvent, CHANNELS, EventType } from '@/lib/redis';
import { logger } from '@/lib/logger';
import { resolveRecipients, type NotifyEvent } from './recipients';
import type { NotificationMeta } from '@/lib/types';

export interface NotifyInput {
  event: NotifyEvent;
  actorId: string;
  actorName?: string | null;
  boardId?: string | null;
  boardTitle?: string | null;
  taskId?: string | null;
  taskTitle?: string | null;
  meta?: NotificationMeta | null;
}

/**
 * Writes one notification row per recipient and publishes each on that user's
 * Redis channel.
 *
 * Never throws. A notification is a side effect of the caller's real work —
 * failing to record one must not fail the task creation or comment that
 * triggered it. Errors are logged and swallowed, matching how the existing
 * routes guard their publishEvent calls.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const recipients = await resolveRecipients(input.event, input.actorId);
    if (recipients.length === 0) return;

    // createManyAndReturn gives us the generated ids, which the client needs in
    // order to mark a notification read. Plain createMany does not return rows.
    const rows = await prisma.notification.createManyAndReturn({
      data: recipients.map((userId) => ({
        userId,
        type: input.event.type,
        actorId: input.actorId,
        actorName: input.actorName ?? null,
        boardId: input.boardId ?? null,
        boardTitle: input.boardTitle ?? null,
        taskId: input.taskId ?? null,
        taskTitle: input.taskTitle ?? null,
        meta: input.meta ?? undefined,
      })),
    });

    await Promise.all(
      rows.map((row) =>
        publishEvent(CHANNELS.USER(row.userId), {
          type: EventType.NOTIFICATION_CREATED,
          data: { notification: { ...row, actor: null } },
        }),
      ),
    );
  } catch (err) {
    logger.error({ err, event: input.event.type }, 'Failed to record notification');
  }
}
