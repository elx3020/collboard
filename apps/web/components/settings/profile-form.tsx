'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useAccount, useUpdateAccountName } from '@/lib/hooks/use-queries';
import { MAX_NAME_LENGTH } from '@/lib/account/validate-name';
import { Avatar, Spinner } from '@/components/ui-shared';

const inputClass =
    'mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]';

export function ProfileForm() {
    const { data: account, isLoading } = useAccount();
    const updateName = useUpdateAccountName();
    const [name, setName] = useState('');

    // Seed once the account arrives. Keyed on the loaded name so a refetch
    // after a successful save does not fight the user's in-flight typing.
    useEffect(() => {
        if (account) setName(account.name ?? '');
    }, [account?.name]); // eslint-disable-line react-hooks/exhaustive-deps

    if (isLoading || !account) return <Spinner />;

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        updateName.mutate(trimmed);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex items-center gap-3">
                <Avatar src={account.image} name={account.name || account.email} size="lg" />
                <p className="text-sm text-[var(--muted-foreground)]">
                    Your picture comes from the account you signed in with.
                </p>
            </div>

            <div>
                <label
                    htmlFor="display-name"
                    className="block text-sm font-medium text-[var(--foreground)]"
                >
                    Display name
                </label>
                <input
                    id="display-name"
                    type="text"
                    value={name}
                    maxLength={MAX_NAME_LENGTH}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClass}
                />
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    This is the name teammates see. Existing notifications keep the name you
                    had when they were sent.
                </p>
            </div>

            <div>
                <span className="block text-sm font-medium text-[var(--foreground)]">Email</span>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">{account.email}</p>
            </div>

            <button
                type="submit"
                disabled={updateName.isPending || !name.trim()}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
                {updateName.isPending ? 'Saving...' : 'Save'}
            </button>
        </form>
    );
}
