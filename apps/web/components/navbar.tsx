'use client';

import { signOut, useSession } from 'next-auth/react';
import Image from 'next/image';
import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';
import { ConnectionStatus } from '@/lib/hooks/use-board-realtime';

export function Navbar() {
    const { data: session } = useSession();

    return (
        <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--card)]">
            <div className="mx-auto flex h-14 max-w-screen-2xl items-center justify-between px-4 sm:px-6">
                {/* Logo */}
                <Link
                    href="/dashboard"
                    className="flex items-center gap-2 font-bold text-lg text-[var(--foreground)]"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-6 w-6 text-[var(--accent)]"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <rect x="3" y="3" width="7" height="7" />
                        <rect x="14" y="3" width="7" height="7" />
                        <rect x="3" y="14" width="7" height="7" />
                        <rect x="14" y="14" width="7" height="7" />
                    </svg>
                    Collboard
                </Link>

                {/* Right side */}
                <div className="flex items-center gap-3">
                    <ConnectionStatus />
                    <ThemeToggle />

                    {session?.user && (
                        <div className="flex items-center gap-3">
                            <span className="hidden text-sm text-[var(--muted-foreground)] sm:inline">
                                {session.user.name || session.user.email}
                            </span>
                            {session.user.image ? (
                                <Image
                                    src={session.user.image}
                                    alt=""
                                    width={32}
                                    height={32}
                                    className="h-8 w-8 rounded-full ring-2 ring-[var(--border)]"
                                />
                            ) : (
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-medium text-white">
                                    {(session.user.name || session.user.email || '?')[0]?.toUpperCase()}
                                </div>
                            )}
                            <button
                                onClick={() => signOut({ callbackUrl: '/' })}
                                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--muted-foreground)] hover:bg-[var(--muted)] transition-colors"
                            >
                                Sign out
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
}
