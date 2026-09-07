'use client';

import { NotificationToggles } from '@/components/settings/notification-toggles';

export default function NotificationSettingsPage() {
    return (
        <div className="space-y-4">
            <p className="text-sm text-[var(--muted-foreground)]">
                Turning one off stops the notification being created at all — it will not
                appear in your bell.
            </p>
            <NotificationToggles />
        </div>
    );
}
