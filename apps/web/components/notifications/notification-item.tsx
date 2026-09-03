'use client';

import { clsx } from 'clsx';
import { Avatar } from '@/components/ui-shared';
import { formatNotification } from '@/lib/notifications/format';
import { formatRelativeTime } from '@/lib/utils/relative-time';
import type { AppNotification } from '@/lib/types';

export function NotificationItem({
    notification,
    onSelect,
}: {
    notification: AppNotification;
    onSelect: (notification: AppNotification) => void;
}) {
    const unread = notification.readAt === null;

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
