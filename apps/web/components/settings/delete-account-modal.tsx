'use client';

import { useState, type FormEvent } from 'react';
import { Modal } from '@/components/modal';
import { AlertTriangleIcon } from '@/components/icons';
import { useAccount, useDeleteAccount } from '@/lib/hooks/use-queries';

const inputClass =
    'mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]';

export function DeleteAccountModal({
    open,
    onClose,
}: {
    open: boolean;
    onClose: () => void;
}) {
    const { data: account } = useAccount();
    const deleteAccount = useDeleteAccount();
    const [confirmation, setConfirmation] = useState('');

    if (!account) return null;

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!confirmation.trim()) return;

        // Which proof the server demands depends on the account, so the form
        // sends whichever one it collected.
        deleteAccount.mutate(
            account.hasPassword
                ? { password: confirmation }
                : { confirmEmail: confirmation }
        );
    };

    return (
        <Modal open={open} onClose={onClose} title="Delete account" size="md">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex gap-3 rounded-lg border border-[var(--destructive)] p-3">
                    <AlertTriangleIcon className="h-5 w-5 shrink-0 text-[var(--destructive)]" />
                    <div className="space-y-2 text-sm text-[var(--foreground)]">
                        <p>This permanently deletes your account. It cannot be undone.</p>
                        {account.ownedBoardsWithMembers > 0 && (
                            <p>
                                <strong>{account.ownedBoardsWithMembers} boards</strong> you own
                                are shared with other people. Deleting your account deletes those
                                boards for everyone on them, along with all their columns, tasks
                                and comments.
                            </p>
                        )}
                    </div>
                </div>

                <div>
                    <label
                        htmlFor="delete-confirmation"
                        className="block text-sm font-medium text-[var(--foreground)]"
                    >
                        {account.hasPassword
                            ? 'Confirm your password'
                            : 'Type your email address to confirm'}
                    </label>
                    <input
                        id="delete-confirmation"
                        type={account.hasPassword ? 'password' : 'email'}
                        autoComplete={account.hasPassword ? 'current-password' : 'off'}
                        value={confirmation}
                        onChange={(e) => setConfirmation(e.target.value)}
                        className={inputClass}
                    />
                    {deleteAccount.error && (
                        <p className="mt-1 text-sm text-[var(--destructive)]">
                            {deleteAccount.error.message}
                        </p>
                    )}
                </div>

                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={deleteAccount.isPending || !confirmation.trim()}
                        className="rounded-lg bg-[var(--destructive)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                        {deleteAccount.isPending ? 'Deleting...' : 'Delete my account'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
