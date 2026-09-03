'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { AlertTriangleIcon } from '@/components/icons';

const ERROR_MESSAGES: Record<string, string> = {
    Configuration: 'There is a problem with the server configuration.',
    AccessDenied: 'You do not have permission to sign in.',
    Verification: 'The verification link has expired or has already been used.',
    OAuthSignin: 'Error connecting to the OAuth provider.',
    OAuthCallback: 'Error processing the OAuth callback.',
    OAuthCreateAccount: 'Could not create an account with this OAuth provider.',
    EmailCreateAccount: 'Could not create an account with this email.',
    Callback: 'An error occurred during the callback.',
    OAuthAccountNotLinked:
        'This email is already associated with another account. Sign in with the original provider.',
    SessionRequired: 'Please sign in to access this page.',
    Default: 'An unexpected error occurred.',
};

function ErrorContent() {
    const searchParams = useSearchParams();
    const error = searchParams.get('error') ?? 'Default';
    const message = ERROR_MESSAGES[error] ?? ERROR_MESSAGES.Default;

    return (
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
            <div className="w-full max-w-md space-y-6 rounded-xl bg-white p-8 shadow-md text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                    <AlertTriangleIcon className="h-6 w-6 text-red-600" />
                </div>

                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Authentication Error</h1>
                    <p className="mt-2 text-sm text-gray-600">{message}</p>
                </div>

                <a
                    href="/auth/signin"
                    className="inline-block rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors"
                >
                    Try Again
                </a>
            </div>
        </div>
    );
}

export default function AuthErrorPage() {
    return (
        <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
            <ErrorContent />
        </Suspense>
    );
}
