'use client';

import { ThemeSelector } from '@/components/settings/theme-selector';

export default function AppearanceSettingsPage() {
    return (
        <div className="space-y-4">
            <p className="text-sm text-[var(--muted-foreground)]">
                System follows your device setting. This choice is saved in this browser
                only.
            </p>
            <ThemeSelector />
        </div>
    );
}
