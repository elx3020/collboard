'use client';

import { SessionProvider } from 'next-auth/react';
import type { Session } from 'next-auth';

interface AuthProviderProps {
    children: React.ReactNode;
    session?: Session | null;
}

/**
 * Client-side authentication provider.
 * Wraps the app with NextAuth's SessionProvider to enable
 * useSession() hook in client components.
 */
export function AuthProvider({ children, session }: AuthProviderProps) {
    return (
        <SessionProvider
            session={session}
            // Re-fetch session every 5 minutes to keep it fresh
            refetchInterval={5 * 60}
            // Re-fetch session when window regains focus
            refetchOnWindowFocus={true}
        >
            {children}
        </SessionProvider>
    );
}
