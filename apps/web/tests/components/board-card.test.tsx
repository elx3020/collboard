// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
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

function makeBoard(overrides: Partial<Board> = {}): Board {
    return {
        id: 'board-1',
        title: 'Q3 Roadmap',
        description: 'Ship the new onboarding',
        ownerId: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        owner: { id: 'user-1', name: 'Ada', email: 'ada@example.com', image: null },
        members: [],
        columns: [],
        currentUserRole: 'OWNER',
        _count: { columns: 4, members: 3 },
        ...overrides,
    };
}

describe('BoardCard', () => {
    it('renders title, description and counts', async () => {
        const { BoardCard } = await import('@/components/dashboard/board-card');

        render(
            <BoardCard board={makeBoard()} onDelete={vi.fn()} onOpenSettings={vi.fn()} />
        );

        expect(screen.getByText('Q3 Roadmap')).toBeInTheDocument();
        expect(screen.getByText('Ship the new onboarding')).toBeInTheDocument();
        expect(screen.getByText('4 columns')).toBeInTheDocument();
        expect(screen.getByText('3 members')).toBeInTheDocument();
    });

    it('links to the board', async () => {
        const { BoardCard } = await import('@/components/dashboard/board-card');

        render(
            <BoardCard board={makeBoard()} onDelete={vi.fn()} onOpenSettings={vi.fn()} />
        );

        expect(screen.getByRole('link', { name: /Q3 Roadmap/ })).toHaveAttribute(
            'href',
            '/boards/board-1'
        );
    });

    it('uses _count.members, not the members array', async () => {
        const { BoardCard } = await import('@/components/dashboard/board-card');

        // The API caps the members array at the current user's own row,
        // so the array length is never the real member count.
        render(
            <BoardCard
                board={makeBoard({ members: [], _count: { columns: 1, members: 7 } })}
                onDelete={vi.fn()}
                onOpenSettings={vi.fn()}
            />
        );

        expect(screen.getByText('7 members')).toBeInTheDocument();
    });

    it('calls onOpenSettings without navigating', async () => {
        const { BoardCard } = await import('@/components/dashboard/board-card');
        const onOpenSettings = vi.fn();
        const board = makeBoard();

        render(
            <BoardCard board={board} onDelete={vi.fn()} onOpenSettings={onOpenSettings} />
        );
        fireEvent.click(screen.getByLabelText('Board settings'));

        expect(onOpenSettings).toHaveBeenCalledWith(board);
    });

    it('calls onDelete with the board id', async () => {
        const { BoardCard } = await import('@/components/dashboard/board-card');
        const onDelete = vi.fn();

        render(
            <BoardCard board={makeBoard()} onDelete={onDelete} onOpenSettings={vi.fn()} />
        );
        fireEvent.click(screen.getByLabelText('Delete board'));

        expect(onDelete).toHaveBeenCalledWith('board-1');
    });

    it('hides settings and delete for non-owners', async () => {
        const { BoardCard } = await import('@/components/dashboard/board-card');

        render(
            <BoardCard
                board={makeBoard({ currentUserRole: 'VIEWER' })}
                onDelete={vi.fn()}
                onOpenSettings={vi.fn()}
            />
        );

        expect(screen.queryByLabelText('Board settings')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Delete board')).not.toBeInTheDocument();
    });

    it('omits the description paragraph when there is none', async () => {
        const { BoardCard } = await import('@/components/dashboard/board-card');

        render(
            <BoardCard
                board={makeBoard({ description: null })}
                onDelete={vi.fn()}
                onOpenSettings={vi.fn()}
            />
        );

        expect(screen.queryByText('Ship the new onboarding')).not.toBeInTheDocument();
    });
});
