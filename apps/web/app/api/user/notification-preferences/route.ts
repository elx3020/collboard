import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/api-guard';
import type { NotificationType } from '@/lib/types';

const NOTIFICATION_TYPES: NotificationType[] = [
  'TASK_ASSIGNED',
  'TASK_COMMENTED',
  'BOARD_INVITED',
  'BOARD_ROLE_CHANGED',
  'BOARD_TASK_ADDED',
  'BOARD_TASK_REMOVED',
];

function isNotificationType(value: unknown): value is NotificationType {
  return NOTIFICATION_TYPES.includes(value as NotificationType);
}

/**
 * PUT /api/user/notification-preferences
 * Body: { mutedTypes: NotificationType[] }
 *
 * PUT rather than PATCH because it replaces the entire array: two switches
 * flipped in quick succession cannot interleave into a half-written state, and
 * a retry of the same body is harmless.
 *
 * An unrecognised type fails the whole request rather than being dropped
 * silently — a typo in a client build should be loud, not a preference that
 * quietly never applies.
 */
export const PUT = withAuth(async (req, { userId }) => {
  const body = (await req.json()) as { mutedTypes?: unknown };

  if (!Array.isArray(body.mutedTypes) || !body.mutedTypes.every(isNotificationType)) {
    return NextResponse.json(
      { error: 'mutedTypes must be an array of notification types' },
      { status: 400 },
    );
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { mutedNotificationTypes: [...new Set(body.mutedTypes)] },
    select: { mutedNotificationTypes: true },
  });

  return NextResponse.json(user);
});
