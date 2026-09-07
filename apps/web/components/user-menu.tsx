'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { Avatar } from '@/components/ui-shared';
import { LogOutIcon, SettingsIcon } from '@/components/icons';

const itemClass =
    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]';

export function UserMenu() {
    const { data: session } = useSession();
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on an outside click or Escape — the menu is not a modal, so it must
    // not trap focus or block the page behind it.
    useEffect(() => {
        if (!open) return;

        const handlePointerDown = (e: MouseEvent) => {
            if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const handleKeyDown = (e: globalThis.KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open]);

    if (!session?.user) return null;

    const label = session.user.name || session.user.email;

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={open}
                className="flex items-center gap-2 rounded-full p-0.5 transition-colors hover:bg-[var(--muted)]"
            >
                <span className="hidden text-sm text-[var(--muted-foreground)] sm:inline">
                    {label}
                </span>
                <Avatar src={session.user.image} name={label} size="md" />
            </button>

            {open && (
                <div
                    role="menu"
                    className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg"
                >
                    <Link
                        role="menuitem"
                        href="/settings/profile"
                        onClick={() => setOpen(false)}
                        className={itemClass}
                    >
                        <SettingsIcon className="h-4 w-4" />
                        Settings
                    </Link>
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => signOut({ callbackUrl: '/' })}
                        className={itemClass}
                    >
                        <LogOutIcon className="h-4 w-4" />
                        Log out
                    </button>
                </div>
            )}
        </div>
    );
}
