// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

const signOutMock = vi.fn();

vi.mock('next-auth/react', () => ({
    signOut: (...args: unknown[]) => signOutMock(...args),
    useSession: () => ({
        data: { user: { id: 'user-1', email: 'ada@example.com', name: 'Ada', image: null } },
    }),
}));

// Spreads every prop through: UserMenu puts role="menuitem" and onClick on the
// Link, and a mock that drops them would hide a real accessibility regression.
vi.mock('next/link', () => ({
    default: ({
        href,
        children,
        ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
        <a href={href} {...props}>
            {children}
        </a>
    ),
}));

beforeEach(() => {
    vi.clearAllMocks();
});

describe('UserMenu', () => {
    it('keeps the menu closed until the avatar is clicked', async () => {
        const { UserMenu } = await import('@/components/user-menu');
        render(<UserMenu />);

        expect(screen.queryByRole('menuitem', { name: /settings/i })).toBeNull();
    });

    it('opens a menu with Settings and Log out', async () => {
        const { UserMenu } = await import('@/components/user-menu');
        render(<UserMenu />);

        fireEvent.click(screen.getByRole('button', { name: /account menu/i }));

        expect(screen.getByRole('menuitem', { name: /settings/i })).toHaveAttribute(
            'href',
            '/settings/profile',
        );
        expect(screen.getByRole('menuitem', { name: /log out/i })).toBeTruthy();
    });

    it('signs out and returns to the landing page', async () => {
        const { UserMenu } = await import('@/components/user-menu');
        render(<UserMenu />);

        fireEvent.click(screen.getByRole('button', { name: /account menu/i }));
        fireEvent.click(screen.getByRole('menuitem', { name: /log out/i }));

        expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: '/' });
    });
});
