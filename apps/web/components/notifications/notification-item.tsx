'use client';

import { clsx } from 'clsx';
import { Avatar } from '@/components/ui-shared';
import { CircleIcon, CheckCircleIcon, ArchiveIcon } from '@/components/icons';
import { formatNotification } from '@/lib/notifications/format';
import { formatRelativeTime } from '@/lib/utils/relative-time';
import type { AppNotification, TaskStatus } from '@/lib/types';

/** The glyph and its announced name for each status a notification can carry. */
const STATUS_GLYPH: Record<TaskStatus, { Icon: typeof CircleIcon; label: string }> = {
    INCOMPLETED: { Icon: CircleIcon, label: 'Incompleted' },
    COMPLETED: { Icon: CheckCircleIcon, label: 'Completed' },
    ARCHIVED: { Icon: ArchiveIcon, label: 'Archived' },
};

export function NotificationItem({
    notification,
    onSelect,
}: {
    notification: AppNotification;
    onSelect: (notification: AppNotification) => void;
}) {
    const unread = notification.readAt === null;

    // Only status changes carry a status; every other type renders as before.
    const glyph =
        notification.type === 'TASK_STATUS_CHANGED' && notification.meta?.status
            ? STATUS_GLYPH[notification.meta.status]
            : null;

    return (
        <button
            type="button"
            onClick={() => onSelect(notification)}
            className={clsx(
                'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--muted)]',
                unread && 'bg-[var(--muted)]/40'
            )}
        >
            <Avatar src={notification.actor?.image} name={notification.actorName} size="sm" />

            {glyph && (
                <glyph.Icon
                    className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted-foreground)]"
                    aria-hidden={undefined}
                    aria-label={glyph.label}
                    role="img"
                />
            )}

            <span className="min-w-0 flex-1">
                <span className="block text-sm text-[var(--foreground)]">
                    {formatNotification(notification)}
                </span>
                <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">
                    {formatRelativeTime(notification.createdAt)}
                </span>
            </span>

            {unread && (
                <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]"
                    aria-label="Unread"
                />
            )}
        </button>
    );
}
