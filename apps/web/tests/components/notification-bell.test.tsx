// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { AppNotification, NotificationPage } from '@/lib/types';

const markRead = vi.fn();
const markAllRead = vi.fn();
const fetchNextPage = vi.fn();
const push = vi.fn();

let pages: NotificationPage[] = [];
let hasNextPage = false;

vi.mock('@/lib/hooks/use-queries', () => ({
    useNotifications: () => ({
        data: { pages },
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage: false,
        isLoading: false,
    }),
    useMarkNotificationRead: () => ({ mutate: markRead }),
    useMarkAllNotificationsRead: () => ({ mutate: markAllRead }),
    queryKeys: { notifications: ['notifications'] },
}));

vi.mock('@/lib/hooks/use-user-realtime', () => ({
    useUserRealtime: () => undefined,
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push }),
}));

function makeNotification(id: string, overrides: Partial<AppNotification> = {}): AppNotification {
    return {
        id,
        type: 'TASK_COMMENTED',
        actorId: 'user-2',
        boardId: 'board-1',
        taskId: 'task-1',
        actorName: 'Ada',
        boardTitle: 'Roadmap',
        taskTitle: `Task ${id}`,
        meta: null,
        readAt: null,
        createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        actor: null,
        ...overrides,
    };
}

function page(ids: string[], unreadCount: number, nextCursor: string | null = null): NotificationPage {
    return { items: ids.map((id) => makeNotification(id)), nextCursor, unreadCount };
}

beforeEach(() => {
    vi.clearAllMocks();
    pages = [];
    hasNextPage = false;
});

async function openBell() {
    const { NotificationBell } = await import('@/components/notifications/notification-bell');
    render(<NotificationBell />);
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
}

describe('NotificationBell', () => {
    it('shows the unread count on the badge', async () => {
        pages = [page(['n-1', 'n-2'], 3)];
        const { NotificationBell } = await import('@/components/notifications/notification-bell');
        render(<NotificationBell />);

        expect(screen.getByText('3')).toBeTruthy();
    });

    it('renders the notifications in the dropdown with a relative time', async () => {
        pages = [page(['n-1', 'n-2'], 2)];
        await openBell();

        expect(await screen.findByText('Ada commented on Task n-1')).toBeTruthy();
        expect(screen.getByText('Ada commented on Task n-2')).toBeTruthy();
        expect(screen.getAllByText('5m').length).toBe(2);
    });

    it('shows an empty state when there is nothing to show', async () => {
        pages = [page([], 0)];
        await openBell();

        expect(await screen.findByText(/no notifications/i)).toBeTruthy();
    });

    it('marks read and navigates when a notification is clicked', async () => {
        pages = [page(['n-1'], 1)];
        await openBell();

        fireEvent.click(await screen.findByText('Ada commented on Task n-1'));

        expect(markRead).toHaveBeenCalledWith('n-1');
        expect(push).toHaveBeenCalledWith('/boards/board-1?task=task-1');
    });

    it('navigates to the board alone when the task is gone', async () => {
        pages = [{ items: [makeNotification('n-1', { taskId: null })], nextCursor: null, unreadCount: 1 }];
        await openBell();

        fireEvent.click(await screen.findByText('Ada commented on Task n-1'));

        expect(push).toHaveBeenCalledWith('/boards/board-1');
    });

    it('offers load more only when another page exists', async () => {
        pages = [page(['n-1'], 1, 'n-1')];
        hasNextPage = true;
        await openBell();

        fireEvent.click(await screen.findByRole('button', { name: /load more/i }));
        expect(fetchNextPage).toHaveBeenCalled();
    });

    it('marks everything read from the header action', async () => {
        pages = [page(['n-1'], 1)];
        await openBell();

        fireEvent.click(await screen.findByRole('button', { name: /mark all as read/i }));
        expect(markAllRead).toHaveBeenCalled();
    });
});
