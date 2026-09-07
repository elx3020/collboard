'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { UserMenu } from '@/components/user-menu';

export function Navbar() {
    return (
        <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--card)]">
            <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-4 sm:px-6">
                {/* Logo */}
                <Link
                    href="/dashboard"
                    className="flex items-center gap-2 font-bold text-lg text-[var(--foreground)]"
                >
                    <Image
                        alt="Collboard logo"
                        src="/collboard-icon.svg"
                        width={32}
                        height={32}
                        className="h-8 w-auto"
                        priority={false}
                    />
                    Collboard
                </Link>

                {/* Right side */}
                <div className="flex items-center gap-3">
                    <NotificationBell />
                    <ThemeToggle />
                    <UserMenu />
                </div>
            </div>
        </header>
    );
}
