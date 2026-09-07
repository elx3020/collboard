'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { LogOutIcon } from '@/components/icons';
import { DeleteAccountModal } from '@/components/settings/delete-account-modal';

export default function AccountSettingsPage() {
    const [deleteOpen, setDeleteOpen] = useState(false);

    return (
        <div className="space-y-8">
            <section className="space-y-2">
                <h2 className="text-sm font-medium text-[var(--foreground)]">Session</h2>
                <p className="text-sm text-[var(--muted-foreground)]">
                    Sign out of Collboard on this device.
                </p>
                <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: '/' })}
                    className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
                >
                    <LogOutIcon className="h-4 w-4" />
                    Log out
                </button>
            </section>

            <section className="space-y-2 rounded-lg border border-[var(--destructive)] p-4">
                <h2 className="text-sm font-medium text-[var(--destructive)]">Danger zone</h2>
                <p className="text-sm text-[var(--muted-foreground)]">
                    Deleting your account removes it permanently, along with every board you
                    own — including boards you share with other people. There is no way to
                    recover them.
                </p>
                <button
                    type="button"
                    onClick={() => setDeleteOpen(true)}
                    className="rounded-lg bg-[var(--destructive)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                    Delete account
                </button>
            </section>

            <DeleteAccountModal open={deleteOpen} onClose={() => setDeleteOpen(false)} />
        </div>
    );
}
