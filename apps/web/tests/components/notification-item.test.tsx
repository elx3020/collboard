// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { NotificationItem } from '@/components/notifications/notification-item';
import type { AppNotification, NotificationType, NotificationMeta } from '@/lib/types';

function make(type: NotificationType, meta: NotificationMeta | null = null): AppNotification {
    return {
        id: 'n-1',
        type,
        actorId: 'user-2',
        boardId: 'board-1',
        taskId: 'task-1',
        actorName: 'Ada',
        boardTitle: 'Roadmap',
        taskTitle: 'Fix login',
        meta,
        readAt: null,
        createdAt: '2026-09-03T12:00:00.000Z',
        actor: null,
    };
}

describe('NotificationItem status icon', () => {
    it('marks a completion with the completed glyph', () => {
        render(
            <NotificationItem
                notification={make('TASK_STATUS_CHANGED', { status: 'COMPLETED' })}
                onSelect={vi.fn()}
            />
        );

        expect(screen.getByLabelText('Completed')).toBeTruthy();
        expect(screen.getByText('Ada completed Fix login')).toBeTruthy();
    });

    it('marks an archive with the archived glyph', () => {
        render(
            <NotificationItem
                notification={make('TASK_STATUS_CHANGED', { status: 'ARCHIVED' })}
                onSelect={vi.fn()}
            />
        );

        expect(screen.getByLabelText('Archived')).toBeTruthy();
    });

    it('shows no status glyph on other notification types', () => {
        render(<NotificationItem notification={make('TASK_ASSIGNED')} onSelect={vi.fn()} />);

        expect(screen.queryByLabelText('Completed')).toBeNull();
        expect(screen.queryByLabelText('Incompleted')).toBeNull();
        expect(screen.queryByLabelText('Archived')).toBeNull();
    });

    it('shows no status glyph when meta is missing', () => {
        render(
            <NotificationItem notification={make('TASK_STATUS_CHANGED', null)} onSelect={vi.fn()} />
        );

        expect(screen.queryByLabelText('Completed')).toBeNull();
    });
});
