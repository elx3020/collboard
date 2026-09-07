// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { AccountProfile } from '@/lib/types';

const mutate = vi.fn();

let account: AccountProfile | undefined;

vi.mock('@/lib/hooks/use-queries', () => ({
    useAccount: () => ({ data: account, isLoading: false }),
    useUpdateNotificationPreferences: () => ({ mutate, isPending: false }),
}));

const profile: AccountProfile = {
    id: 'user-1',
    name: 'Ada',
    email: 'ada@example.com',
    image: null,
    hasPassword: true,
    mutedNotificationTypes: ['BOARD_TASK_ADDED'],
    ownedBoardsWithMembers: 0,
};

beforeEach(() => {
    vi.clearAllMocks();
    account = { ...profile, mutedNotificationTypes: ['BOARD_TASK_ADDED'] };
});

describe('NotificationToggles', () => {
    it('renders one switch per notification type', async () => {
        const { NotificationToggles } = await import('@/components/settings/notification-toggles');
        render(<NotificationToggles />);

        expect(screen.getAllByRole('switch')).toHaveLength(6);
    });

    it('shows a muted type as off and an unmuted type as on', async () => {
        const { NotificationToggles } = await import('@/components/settings/notification-toggles');
        render(<NotificationToggles />);

        expect(screen.getByRole('switch', { name: /new tasks on your boards/i })).toHaveAttribute(
            'aria-checked',
            'false',
        );
        expect(screen.getByRole('switch', { name: /assigned to you/i })).toHaveAttribute(
            'aria-checked',
            'true',
        );
    });

    it('muting a type sends the whole array with that type added', async () => {
        const { NotificationToggles } = await import('@/components/settings/notification-toggles');
        render(<NotificationToggles />);

        fireEvent.click(screen.getByRole('switch', { name: /assigned to you/i }));

        expect(mutate).toHaveBeenCalledWith(['BOARD_TASK_ADDED', 'TASK_ASSIGNED']);
    });

    it('unmuting a type sends the array with that type removed', async () => {
        const { NotificationToggles } = await import('@/components/settings/notification-toggles');
        render(<NotificationToggles />);

        fireEvent.click(screen.getByRole('switch', { name: /new tasks on your boards/i }));

        expect(mutate).toHaveBeenCalledWith([]);
    });
});
