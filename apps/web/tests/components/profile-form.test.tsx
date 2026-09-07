// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { AccountProfile } from '@/lib/types';

const mutate = vi.fn();

let account: AccountProfile | undefined;

vi.mock('@/lib/hooks/use-queries', () => ({
    useAccount: () => ({ data: account, isLoading: false }),
    useUpdateAccountName: () => ({ mutate, isPending: false }),
}));

const profile: AccountProfile = {
    id: 'user-1',
    name: 'Ada',
    email: 'ada@example.com',
    image: null,
    hasPassword: true,
    mutedNotificationTypes: [],
    ownedBoardsWithMembers: 0,
};

beforeEach(() => {
    vi.clearAllMocks();
    account = { ...profile };
});

describe('ProfileForm', () => {
    it('seeds the input from the loaded account', async () => {
        const { ProfileForm } = await import('@/components/settings/profile-form');
        render(<ProfileForm />);

        expect(screen.getByLabelText(/display name/i)).toHaveValue('Ada');
    });

    it('shows the email as read-only text, not an editable field', async () => {
        const { ProfileForm } = await import('@/components/settings/profile-form');
        render(<ProfileForm />);

        expect(screen.getByText('ada@example.com')).toBeTruthy();
        expect(screen.queryByLabelText(/^email$/i)).toBeNull();
    });

    it('submits the trimmed name', async () => {
        const { ProfileForm } = await import('@/components/settings/profile-form');
        render(<ProfileForm />);

        fireEvent.change(screen.getByLabelText(/display name/i), {
            target: { value: '  Ada Lovelace  ' },
        });
        fireEvent.click(screen.getByRole('button', { name: /save/i }));

        expect(mutate).toHaveBeenCalledWith('Ada Lovelace');
    });

    it('does not submit an empty name', async () => {
        const { ProfileForm } = await import('@/components/settings/profile-form');
        render(<ProfileForm />);

        fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: '   ' } });
        fireEvent.click(screen.getByRole('button', { name: /save/i }));

        expect(mutate).not.toHaveBeenCalled();
    });
});
