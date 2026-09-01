'use client';

import type { ChangeEvent, HTMLInputAutoCompleteAttribute } from 'react';

/** Shared input styling — matches the inputs used across the rest of the app. */
const inputClass =
    'mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]';

export function AuthField({
    id,
    label,
    type,
    value,
    onChange,
    placeholder,
    hint,
    required = false,
    autoComplete,
}: {
    id: string;
    label: string;
    type: 'text' | 'email' | 'password';
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    hint?: string;
    required?: boolean;
    autoComplete?: HTMLInputAutoCompleteAttribute;
}) {
    return (
        <div>
            <label htmlFor={id} className="block text-sm font-medium text-[var(--foreground)]">
                {label}
            </label>
            <input
                id={id}
                type={type}
                value={value}
                onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
                required={required}
                placeholder={placeholder}
                autoComplete={autoComplete}
                className={inputClass}
            />
            {hint && <p className="mt-1 text-xs text-[var(--muted-foreground)]">{hint}</p>}
        </div>
    );
}

export function AuthSubmitButton({
    isLoading,
    loadingLabel,
    children,
}: {
    isLoading: boolean;
    loadingLabel: string;
    children: React.ReactNode;
}) {
    return (
        <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-gray-900 shadow-sm transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 disabled:opacity-50"
        >
            {isLoading ? loadingLabel : children}
        </button>
    );
}

/** Renders nothing when there is nothing to report. */
export function AuthErrorBanner({ errors }: { errors: string[] }) {
    if (errors.length === 0) return null;

    return (
        <div
            role="alert"
            className="rounded-md border border-[var(--destructive)] bg-[var(--destructive)]/10 p-4 text-sm text-[var(--foreground)]"
        >
            {errors.length === 1 ? (
                errors[0]
            ) : (
                <ul className="list-disc space-y-1 pl-4">
                    {errors.map((error, i) => (
                        <li key={i}>{error}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export function AuthDivider({ children }: { children: React.ReactNode }) {
    return (
        <div className="relative">
            <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-[var(--border)]" />
            </div>
            <div className="relative flex justify-center text-sm">
                <span className="bg-[var(--card)] px-2 text-[var(--muted-foreground)]">
                    {children}
                </span>
            </div>
        </div>
    );
}
