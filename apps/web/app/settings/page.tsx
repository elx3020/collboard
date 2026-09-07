import { redirect } from 'next/navigation';

/** /settings has no content of its own — the profile tab is the landing tab. */
export default function SettingsPage() {
    redirect('/settings/profile');
}
