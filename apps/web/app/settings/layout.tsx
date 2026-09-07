'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { Navbar } from '@/components/navbar';

const TABS = [
    { href: '/settings/profile', label: 'Profile' },
    { href: '/settings/notifications', label: 'Notifications' },
    { href: '/settings/appearance', label: 'Appearance' },
    { href: '/settings/account', label: 'Account' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    return (
        <div className="min-h-screen bg-[var(--background)]">
            <Navbar />

            <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
                <h1 className="text-2xl font-semibold text-[var(--foreground)]">Settings</h1>

                <nav
                    aria-label="Settings sections"
                    className="mt-6 flex gap-1 overflow-x-auto border-b border-[var(--border)]"
                >
                    {TABS.map((tab) => {
                        const active = pathname === tab.href;
                        return (
                            <Link
                                key={tab.href}
                                href={tab.href}
                                aria-current={active ? 'page' : undefined}
                                className={clsx(
                                    'whitespace-nowrap border-b-2 px-4 py-2 text-sm transition-colors',
                                    active
                                        ? 'border-[var(--accent)] font-medium text-[var(--foreground)]'
                                        : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                                )}
                            >
                                {tab.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="py-6">{children}</div>
            </div>
        </div>
    );
}
