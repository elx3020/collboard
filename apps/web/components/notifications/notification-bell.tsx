'use client';

import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { useRouter } from 'next/navigation';
import { BellIcon } from '@/components/icons';
import { NotificationItem } from '@/components/notifications/notification-item';
import {
    useNotifications,
    useMarkNotificationRead,
    useMarkAllNotificationsRead,
} from '@/lib/hooks/use-queries';
import { useUserRealtime } from '@/lib/hooks/use-user-realtime';
import type { AppNotification } from '@/lib/types';

export function NotificationBell() {
    // Keeps the feed fresh; ws-server pushes to this user's own room.
    useUserRealtime();

    const router = useRouter();
    const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useNotifications();
    const markRead = useMarkNotificationRead();
    const markAllRead = useMarkAllNotificationsRead();

    const items = data?.pages.flatMap((p) => p.items) ?? [];
    const unreadCount = data?.pages[0]?.unreadCount ?? 0;

    const handleSelect = (notification: AppNotification) => {
        if (notification.readAt === null) {
            markRead.mutate(notification.id);
        }

        if (!notification.boardId) return;

        // A deleted task leaves taskId null, so fall back to the board itself.
        router.push(
            notification.taskId
                ? `/boards/${notification.boardId}?task=${notification.taskId}`
                : `/boards/${notification.boardId}`
        );
    };

    return (
        <Popover className="relative">
            <PopoverButton
                className="relative rounded-lg p-2 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
            >
                <BellIcon className="h-5 w-5" />
                {unreadCount > 0 && (
                    <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-semibold text-[var(--accent-foreground)]">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </PopoverButton>

            <PopoverPanel className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl">
                <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
                    <h2 className="text-sm font-semibold text-[var(--foreground)]">Notifications</h2>
                    {unreadCount > 0 && (
                        <button
                            type="button"
                            onClick={() => markAllRead.mutate()}
                            className="text-xs text-[var(--muted-foreground)] transition-colors hover:text-[var(--accent)]"
                        >
                            Mark all as read
                        </button>
                    )}
                </div>

                <div className="max-h-96 overflow-y-auto">
                    {items.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">
                            No notifications yet
                        </p>
                    ) : (
                        <ul className="divide-y divide-[var(--border)]">
                            {items.map((notification) => (
                                <li key={notification.id}>
                                    <NotificationItem
                                        notification={notification}
                                        onSelect={handleSelect}
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {hasNextPage && (
                    <button
                        type="button"
                        onClick={() => fetchNextPage()}
                        disabled={isFetchingNextPage}
                        className="w-full border-t border-[var(--border)] px-4 py-2.5 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50"
                    >
                        {isFetchingNextPage ? 'Loading…' : 'Load more'}
                    </button>
                )}
            </PopoverPanel>
        </Popover>
    );
}
