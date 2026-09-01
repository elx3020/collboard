// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { Board } from '@/lib/types';

vi.mock('next/link', () => ({
    default: ({
        children,
        href,
        ...rest
    }: { children: React.ReactNode; href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}));

const STORAGE_KEY = 'collboard.dashboard.collapsed';

function makeBoard(id: string): Board {
    return {
        id,
        title: `Board ${id}`,
        description: null,
        color: null,
        ownerId: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        owner: { id: 'user-1', name: 'Ada', email: 'ada@example.com', image: null },
        members: [],
        columns: [],
        currentUserRole: 'OWNER',
        _count: { columns: 0, members: 0 },
    };
}

function renderSection(boards: Board[] = []) {
    return {
        boards,
        props: {
            id: 'sharedByMe' as const,
            title: 'Shared by me',
            boards,
            emptyHint: 'Boards you own and have invited others to.',
            onDelete: vi.fn(),
            onOpenSettings: vi.fn(),
        },
    };
}

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('BoardSection', () => {
    it('renders the section and its placeholder when empty', async () => {
        const { BoardSection } = await import('@/components/dashboard/board-section');
        const { props } = renderSection([]);

        render(<BoardSection {...props} />);

        expect(screen.getByText('Shared by me')).toBeInTheDocument();
        expect(
            screen.getByText('Boards you own and have invited others to.')
        ).toBeInTheDocument();
    });

    it('shows a zero count when empty', async () => {
        const { BoardSection } = await import('@/components/dashboard/board-section');
        const { props } = renderSection([]);

        render(<BoardSection {...props} />);

        expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('renders cards and no placeholder when it has boards', async () => {
        const { BoardSection } = await import('@/components/dashboard/board-section');
        const { props } = renderSection([makeBoard('b1'), makeBoard('b2')]);

        render(<BoardSection {...props} />);

        expect(screen.getByText('Board b1')).toBeInTheDocument();
        expect(screen.getByText('Board b2')).toBeInTheDocument();
        expect(
            screen.queryByText('Boards you own and have invited others to.')
        ).not.toBeInTheDocument();
    });

    it('starts expanded', async () => {
        const { BoardSection } = await import('@/components/dashboard/board-section');
        const { props } = renderSection([makeBoard('b1')]);

        render(<BoardSection {...props} />);

        expect(screen.getByRole('button', { name: /Shared by me/ })).toHaveAttribute(
            'aria-expanded',
            'true'
        );
        expect(screen.getByText('Board b1')).toBeVisible();
    });

    it('collapses when the title is clicked', async () => {
        const { BoardSection } = await import('@/components/dashboard/board-section');
        const { props } = renderSection([makeBoard('b1')]);

        render(<BoardSection {...props} />);
        fireEvent.click(screen.getByRole('button', { name: /Shared by me/ }));

        expect(screen.getByRole('button', { name: /Shared by me/ })).toHaveAttribute(
            'aria-expanded',
            'false'
        );
        expect(screen.getByText('Board b1')).not.toBeVisible();
    });

    it('persists the collapsed section to localStorage', async () => {
        const { BoardSection } = await import('@/components/dashboard/board-section');
        const { props } = renderSection([makeBoard('b1')]);

        render(<BoardSection {...props} />);
        fireEvent.click(screen.getByRole('button', { name: /Shared by me/ }));

        expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toEqual([
            'sharedByMe',
        ]);
    });

    it('removes the section from storage when expanded again', async () => {
        const { BoardSection } = await import('@/components/dashboard/board-section');
        const { props } = renderSection([makeBoard('b1')]);

        render(<BoardSection {...props} />);
        const toggle = screen.getByRole('button', { name: /Shared by me/ });
        fireEvent.click(toggle);
        fireEvent.click(toggle);

        expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toEqual([]);
    });

    it('restores the collapsed state from localStorage on mount', async () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(['sharedByMe']));

        const { BoardSection } = await import('@/components/dashboard/board-section');
        const { props } = renderSection([makeBoard('b1')]);

        render(<BoardSection {...props} />);

        expect(screen.getByRole('button', { name: /Shared by me/ })).toHaveAttribute(
            'aria-expanded',
            'false'
        );
    });

    it('leaves other sections collapsed when this one toggles', async () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(['owned']));

        const { BoardSection } = await import('@/components/dashboard/board-section');
        const { props } = renderSection([makeBoard('b1')]);

        render(<BoardSection {...props} />);
        fireEvent.click(screen.getByRole('button', { name: /Shared by me/ }));

        expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]').sort()).toEqual([
            'owned',
            'sharedByMe',
        ]);
    });

    it('renders expanded when localStorage is unavailable', async () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('SecurityError: storage is blocked');
        });

        const { BoardSection } = await import('@/components/dashboard/board-section');
        const { props } = renderSection([makeBoard('b1')]);

        render(<BoardSection {...props} />);

        expect(screen.getByRole('button', { name: /Shared by me/ })).toHaveAttribute(
            'aria-expanded',
            'true'
        );
        expect(screen.getByText('Board b1')).toBeVisible();
    });

    it('still toggles when writing to localStorage throws', async () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceededError');
        });

        const { BoardSection } = await import('@/components/dashboard/board-section');
        const { props } = renderSection([makeBoard('b1')]);

        render(<BoardSection {...props} />);
        fireEvent.click(screen.getByRole('button', { name: /Shared by me/ }));

        expect(screen.getByRole('button', { name: /Shared by me/ })).toHaveAttribute(
            'aria-expanded',
            'false'
        );
    });

    it('ignores a corrupt storage value', async () => {
        localStorage.setItem(STORAGE_KEY, 'not json at all');

        const { BoardSection } = await import('@/components/dashboard/board-section');
        const { props } = renderSection([makeBoard('b1')]);

        render(<BoardSection {...props} />);

        expect(screen.getByRole('button', { name: /Shared by me/ })).toHaveAttribute(
            'aria-expanded',
            'true'
        );
    });
});
