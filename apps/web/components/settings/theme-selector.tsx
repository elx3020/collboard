'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { clsx } from 'clsx';
import { MonitorIcon, MoonIcon, SunIcon } from '@/components/icons';

const OPTIONS = [
    { value: 'system', label: 'System', Icon: MonitorIcon },
    { value: 'light', label: 'Light', Icon: SunIcon },
    { value: 'dark', label: 'Dark', Icon: MoonIcon },
] as const;

/**
 * Three-way theme control.
 *
 * The choice stays in localStorage via next-themes — it is per-browser and
 * never reaches the server, so there is no API call here.
 */
export function ThemeSelector() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    // Before hydration the resolved theme is unknown, and rendering a selection
    // anyway marks the wrong option as active.
    useEffect(() => setMounted(true), []);

    return (
        <div role="radiogroup" aria-label="Theme" className="grid max-w-md grid-cols-3 gap-2">
            {OPTIONS.map(({ value, label, Icon }) => {
                const active = mounted && theme === value;

                return (
                    <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        aria-label={label}
                        onClick={() => setTheme(value)}
                        className={clsx(
                            'flex flex-col items-center gap-2 rounded-lg border px-4 py-4 text-sm transition-colors',
                            active
                                ? 'border-[var(--accent)] bg-[var(--muted)] font-medium text-[var(--foreground)]'
                                : 'border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]'
                        )}
                    >
                        <Icon className="h-5 w-5" />
                        {label}
                    </button>
                );
            })}
        </div>
    );
}
