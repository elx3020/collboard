// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { AccountProfile } from '@/lib/types';

const mutate = vi.fn();
let account: AccountProfile | undefined;
let mutationError: Error | null = null;

vi.mock('@/lib/hooks/use-queries', () => ({
    useAccount: () => ({ data: account, isLoading: false }),
    useDeleteAccount: () => ({ mutate, isPending: false, error: mutationError }),
}));

const profile: AccountProfile = {
    id: 'user-1',
    name: 'Ada',
    email: 'ada@example.com',
    image: null,
    hasPassword: true,
    mutedNotificationTypes: [],
    ownedBoardsWithMembers: 2,
};

beforeEach(() => {
    vi.clearAllMocks();
    account = { ...profile };
    mutationError = null;
});

describe('DeleteAccountModal', () => {
    it('asks for a password when the account has one', async () => {
        const { DeleteAccountModal } = await import('@/components/settings/delete-account-modal');
        render(<DeleteAccountModal open onClose={() => {}} />);

        expect(screen.getByLabelText(/password/i)).toBeTruthy();
        expect(screen.queryByLabelText(/email address/i)).toBeNull();
    });

    it('asks for the email address when the account has no password', async () => {
        account = { ...profile, hasPassword: false };
        const { DeleteAccountModal } = await import('@/components/settings/delete-account-modal');
        render(<DeleteAccountModal open onClose={() => {}} />);

        expect(screen.getByLabelText(/email address/i)).toBeTruthy();
        expect(screen.queryByLabelText(/password/i)).toBeNull();
    });

    it('names how many shared boards will be destroyed', async () => {
        const { DeleteAccountModal } = await import('@/components/settings/delete-account-modal');
        render(<DeleteAccountModal open onClose={() => {}} />);

        expect(screen.getByText(/2 boards/i)).toBeTruthy();
    });

    it('keeps the confirm button disabled until the field is filled', async () => {
        const { DeleteAccountModal } = await import('@/components/settings/delete-account-modal');
        render(<DeleteAccountModal open onClose={() => {}} />);

        const confirm = screen.getByRole('button', { name: /delete my account/i });
        expect(confirm).toBeDisabled();

        fireEvent.change(screen.getByLabelText(/password/i), {
            target: { value: 'CorrectHorse1!' },
        });
        expect(confirm).not.toBeDisabled();
    });

    it('submits the password as the confirmation', async () => {
        const { DeleteAccountModal } = await import('@/components/settings/delete-account-modal');
        render(<DeleteAccountModal open onClose={() => {}} />);

        fireEvent.change(screen.getByLabelText(/password/i), {
            target: { value: 'CorrectHorse1!' },
        });
        fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));

        expect(mutate).toHaveBeenCalledWith({ password: 'CorrectHorse1!' });
    });

    it('submits the email as the confirmation for an OAuth-only account', async () => {
        account = { ...profile, hasPassword: false };
        const { DeleteAccountModal } = await import('@/components/settings/delete-account-modal');
        render(<DeleteAccountModal open onClose={() => {}} />);

        fireEvent.change(screen.getByLabelText(/email address/i), {
            target: { value: 'ada@example.com' },
        });
        fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));

        expect(mutate).toHaveBeenCalledWith({ confirmEmail: 'ada@example.com' });
    });

    it('shows a failure inline rather than closing', async () => {
        mutationError = new Error('Confirmation failed');
        const { DeleteAccountModal } = await import('@/components/settings/delete-account-modal');
        render(<DeleteAccountModal open onClose={() => {}} />);

        expect(screen.getByText('Confirmation failed')).toBeTruthy();
    });
});
