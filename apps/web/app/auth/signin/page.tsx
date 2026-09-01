'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState, type FormEvent, Suspense } from 'react';
import { AuthCard } from '@/components/auth/auth-card';
import {
    AuthDivider,
    AuthErrorBanner,
    AuthField,
    AuthSubmitButton,
} from '@/components/auth/auth-form-fields';
import { OAuthButtons } from '@/components/auth/oauth-buttons';

function SignInForm() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const callbackUrl = searchParams.get('callbackUrl') ?? '/dashboard';
    const error = searchParams.get('error');

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const handleCredentialsSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setFormError(null);

        const result = await signIn('credentials', {
            email,
            password,
            redirect: false,
            callbackUrl,
        });

        setIsLoading(false);

        if (result?.error) {
            setFormError('Invalid email or password');
        } else if (result?.url) {
            router.push(result.url);
        }
    };

    const errors = (() => {
        if (error === 'SessionExpired') {
            return ['Your session has expired. Please sign in again.'];
        }
        if (formError) return [formError];
        if (error) return ['An error occurred during sign-in.'];
        return [];
    })();

    return (
        <AuthCard
            title="Sign In"
            subtitle="Sign in to your Collboard account"
            footer={{ text: "Don't have an account?", href: '/auth/signup', label: 'Sign up' }}
        >
            <AuthErrorBanner errors={errors} />

            <OAuthButtons callbackUrl={callbackUrl} />

            <AuthDivider>Or continue with email</AuthDivider>

            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
                <AuthField
                    id="email"
                    label="Email"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                />

                <AuthField
                    id="password"
                    label="Password"
                    type="password"
                    value={password}
                    onChange={setPassword}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                />

                <AuthSubmitButton isLoading={isLoading} loadingLabel="Signing in...">
                    Sign In
                </AuthSubmitButton>
            </form>
        </AuthCard>
    );
}

export default function SignInPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-screen items-center justify-center bg-[var(--background)] text-[var(--muted-foreground)]">
                    Loading...
                </div>
            }
        >
            <SignInForm />
        </Suspense>
    );
}
