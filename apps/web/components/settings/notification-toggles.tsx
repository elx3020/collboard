'use client';

import { clsx } from 'clsx';
import { useAccount, useUpdateNotificationPreferences } from '@/lib/hooks/use-queries';
import { Spinner } from '@/components/ui-shared';
import type { NotificationType } from '@/lib/types';

/**
 * Setting copy, in the order the switches appear. Deliberately separate from
 * `formatNotification` in lib/notifications/format.ts: that writes the text of
 * a single notice, this names a category the user is choosing to receive.
 */
const SETTINGS: { type: NotificationType; label: string; hint: string }[] = [
    {
        type: 'TASK_ASSIGNED',
        label: 'Tasks assigned to you',
        hint: 'When someone puts your name on a task.',
    },
    {
        type: 'TASK_COMMENTED',
        label: 'Comments on your tasks',
        hint: 'Tasks you are assigned to or have commented on.',
    },
    {
        type: 'BOARD_INVITED',
        label: 'Board invitations',
        hint: 'When someone adds you to a board.',
    },
    {
        type: 'BOARD_ROLE_CHANGED',
        label: 'Role changes',
        hint: 'When your role on a board changes.',
    },
    {
        type: 'BOARD_TASK_ADDED',
        label: 'New tasks on your boards',
        hint: 'Every task created on a board you belong to.',
    },
    {
        type: 'BOARD_TASK_REMOVED',
        label: 'Deleted tasks on your boards',
        hint: 'Every task deleted from a board you belong to.',
    },
];

export function NotificationToggles() {
    const { data: account, isLoading } = useAccount();
    const updatePreferences = useUpdateNotificationPreferences();

    if (isLoading || !account) return <Spinner />;

    const muted = account.mutedNotificationTypes;

    const toggle = (type: NotificationType) => {
        // Send the whole array, not a delta: PUT replaces it, so two quick
        // flips cannot interleave into a half-written state.
        const next = muted.includes(type)
            ? muted.filter((t) => t !== type)
            : [...muted, type];

        updatePreferences.mutate(next);
    };

    return (
        <ul className="divide-y divide-[var(--border)]">
            {SETTINGS.map(({ type, label, hint }) => {
                const enabled = !muted.includes(type);

                return (
                    <li key={type} className="flex items-center justify-between gap-4 py-4">
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-[var(--foreground)]">{label}</p>
                            <p className="text-xs text-[var(--muted-foreground)]">{hint}</p>
                        </div>

                        <button
                            type="button"
                            role="switch"
                            aria-checked={enabled}
                            aria-label={label}
                            onClick={() => toggle(type)}
                            className={clsx(
                                'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                                enabled ? 'bg-[var(--accent)]' : 'bg-[var(--muted)]'
                            )}
                        >
                            <span
                                className={clsx(
                                    'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                                    enabled ? 'translate-x-5' : 'translate-x-0.5'
                                )}
                            />
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}
