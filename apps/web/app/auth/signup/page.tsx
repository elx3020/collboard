'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { AuthCard } from '@/components/auth/auth-card';
import {
    AuthDivider,
    AuthErrorBanner,
    AuthField,
    AuthSubmitButton,
} from '@/components/auth/auth-form-fields';
import { OAuthButtons } from '@/components/auth/oauth-buttons';

const CALLBACK_URL = '/dashboard';

export default function SignUpPage() {
    const router = useRouter();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [errors, setErrors] = useState<string[]>([]);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setErrors([]);

        // Client-side validation
        if (password !== confirmPassword) {
            setErrors(['Passwords do not match']);
            setIsLoading(false);
            return;
        }

        try {
            // Register the user
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, name: name || undefined }),
            });

            const data = await res.json();

            if (!res.ok) {
                setErrors(data.details ?? [data.error]);
                setIsLoading(false);
                return;
            }

            // Auto sign-in after registration
            const signInResult = await signIn('credentials', {
                email,
                password,
                redirect: false,
                callbackUrl: CALLBACK_URL,
            });

            if (signInResult?.error) {
                setErrors(['Registration succeeded but sign-in failed. Please sign in manually.']);
                setIsLoading(false);
                return;
            }

            router.push(CALLBACK_URL);
        } catch {
            setErrors(['An unexpected error occurred. Please try again.']);
            setIsLoading(false);
        }
    };

    return (
        <AuthCard
            title="Create Account"
            subtitle="Sign up for a new Collboard account"
            footer={{ text: 'Already have an account?', href: '/auth/signin', label: 'Sign in' }}
        >
            <AuthErrorBanner errors={errors} />

            <OAuthButtons callbackUrl={CALLBACK_URL} />

            <AuthDivider>Or sign up with email</AuthDivider>

            <form onSubmit={handleSubmit} className="space-y-4">
                <AuthField
                    id="name"
                    label="Name (optional)"
                    type="text"
                    value={name}
                    onChange={setName}
                    placeholder="Your name"
                    autoComplete="name"
                />

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
                    hint="Min 8 chars, uppercase, lowercase, number, and special character"
                    autoComplete="new-password"
                    required
                />

                <AuthField
                    id="confirmPassword"
                    label="Confirm Password"
                    type="password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    required
                />

                <AuthSubmitButton isLoading={isLoading} loadingLabel="Creating account...">
                    Create Account
                </AuthSubmitButton>
            </form>
        </AuthCard>
    );
}
