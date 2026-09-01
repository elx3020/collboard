'use client';

import Link from 'next/link';

export function AuthCard({
    title,
    subtitle,
    footer,
    children,
}: {
    title: string;
    subtitle: string;
    footer: { text: string; href: string; label: string };
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4">
            <div className="w-full max-w-md space-y-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-8 shadow-md">
                <div className="text-center">
                    <h1 className="text-3xl font-bold text-[var(--card-foreground)]">{title}</h1>
                    <p className="mt-2 text-sm text-[var(--muted-foreground)]">{subtitle}</p>
                </div>

                {children}

                <p className="text-center text-sm text-[var(--muted-foreground)]">
                    {footer.text}{' '}
                    <Link
                        href={footer.href}
                        className="font-medium text-[var(--foreground)] underline underline-offset-4 hover:no-underline"
                    >
                        {footer.label}
                    </Link>
                </p>
            </div>
        </div>
    );
}
