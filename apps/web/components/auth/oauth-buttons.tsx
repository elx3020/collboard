'use client';

import { signIn } from 'next-auth/react';
import { GitHubIcon, GoogleIcon } from '@/components/icons';

const oauthButtonClass =
    'flex w-full items-center justify-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] shadow-sm transition-colors hover:bg-[var(--muted)]';

export function OAuthButtons({ callbackUrl }: { callbackUrl: string }) {
    return (
        <div className="space-y-3">
            <button
                type="button"
                onClick={() => signIn('github', { callbackUrl })}
                className={oauthButtonClass}
            >
                <GitHubIcon className="h-5 w-5" />
                Continue with GitHub
            </button>

            <button
                type="button"
                onClick={() => signIn('google', { callbackUrl })}
                className={oauthButtonClass}
            >
                <GoogleIcon className="h-5 w-5" />
                Continue with Google
            </button>
        </div>
    );
}
