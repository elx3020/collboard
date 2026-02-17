// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// ── Mocks ──────────────────────────────────────────────────────────────────────

// Mock next-auth/react
vi.mock('next-auth/react', () => ({
    useSession: vi.fn(() => ({
        data: {
            user: { id: 'user-1', name: 'Test User', email: 'test@test.com', image: null },
        },
        status: 'authenticated',
    })),
    signOut: vi.fn(),
}));

// Mock next/image
vi.mock('next/image', () => ({
    default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
        return <img {...props} />;
    },
}));

// Mock next/link
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

// Mock WebSocket connection status
vi.mock('@/lib/hooks/use-board-realtime', () => ({
    ConnectionStatus: () => <span data-testid="connection-status">Connected</span>,
}));

// Mock next-themes
vi.mock('next-themes', () => ({
    useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}));

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('Navbar', () => {
    it('renders the logo and user info', async () => {
        const { Navbar } = await import('@/components/navbar');

        render(<Navbar />);

        expect(screen.getByText('Collboard')).toBeInTheDocument();
        expect(screen.getByText('Test User')).toBeInTheDocument();
        expect(screen.getByText('Sign out')).toBeInTheDocument();
    });

    it('calls signOut on click', async () => {
        const { signOut } = await import('next-auth/react');
        const { Navbar } = await import('@/components/navbar');

        render(<Navbar />);
        fireEvent.click(screen.getByText('Sign out'));

        expect(signOut).toHaveBeenCalledWith({ callbackUrl: '/' });
    });
});

describe('Modal', () => {
    it('renders children when open', async () => {
        const { Modal } = await import('@/components/modal');

        render(
            <Modal open={true} onClose={() => { }} title="Test Modal">
                <p>Modal Content</p>
            </Modal>
        );

        expect(screen.getByText('Test Modal')).toBeInTheDocument();
        expect(screen.getByText('Modal Content')).toBeInTheDocument();
    });

    it('does not render when closed', async () => {
        const { Modal } = await import('@/components/modal');

        render(
            <Modal open={false} onClose={() => { }} title="Test Modal">
                <p>Modal Content</p>
            </Modal>
        );

        expect(screen.queryByText('Test Modal')).not.toBeInTheDocument();
    });

    it('calls onClose when close button is clicked', async () => {
        const onClose = vi.fn();
        const { Modal } = await import('@/components/modal');

        render(
            <Modal open={true} onClose={onClose} title="Test Modal">
                <p>Content</p>
            </Modal>
        );

        fireEvent.click(screen.getByLabelText('Close'));
        expect(onClose).toHaveBeenCalled();
    });
});

describe('PriorityBadge', () => {
    it.each(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const)(
        'renders %s priority badge',
        async (priority) => {
            const { PriorityBadge } = await import('@/components/ui-shared');

            render(<PriorityBadge priority={priority} />);
            const label = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', URGENT: 'Urgent' }[priority];
            expect(screen.getByText(label)).toBeInTheDocument();
        }
    );
});

describe('EmptyState', () => {
    it('renders title, description and action', async () => {
        const { EmptyState } = await import('@/components/ui-shared');

        render(
            <EmptyState
                title="No items"
                description="Create something"
                action={<button>Create</button>}
            />
        );

        expect(screen.getByText('No items')).toBeInTheDocument();
        expect(screen.getByText('Create something')).toBeInTheDocument();
        expect(screen.getByText('Create')).toBeInTheDocument();
    });
});

describe('TaskCard', () => {
    it('renders task title, priority, and assignee', async () => {
        // Mock dnd-kit
        vi.mock('@dnd-kit/sortable', () => ({
            useSortable: () => ({
                attributes: {},
                listeners: {},
                setNodeRef: () => { },
                transform: null,
                transition: null,
                isDragging: false,
            }),
        }));

        vi.mock('@dnd-kit/utilities', () => ({
            CSS: { Transform: { toString: () => undefined } },
        }));

        const { TaskCard } = await import('@/components/board/task-card');

        const task = {
            id: 'task-1',
            title: 'Test Task',
            description: 'A description',
            columnId: 'col-1',
            order: 0,
            assigneeId: 'user-1',
            priority: 'HIGH' as const,
            createdAt: '2026-01-01',
            updatedAt: '2026-01-01',
            assignee: { id: 'user-1', name: 'Alice', email: 'alice@t.com', image: null },
            _count: { comments: 3 },
        };

        const onClick = vi.fn();
        render(<TaskCard task={task} onClick={onClick} />);

        expect(screen.getByText('Test Task')).toBeInTheDocument();
        expect(screen.getByText('A description')).toBeInTheDocument();
        expect(screen.getByText('High')).toBeInTheDocument();
        expect(screen.getByText('Alice')).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
    });
});

describe('CreateBoardModal', () => {
    // Mock react-query mutation — use vi.hoisted to ensure it's available in vi.mock
    const { mockMutateAsync } = vi.hoisted(() => ({
        mockMutateAsync: vi.fn().mockResolvedValue({}),
    }));

    vi.mock('@/lib/hooks/use-queries', () => ({
        useCreateBoard: () => ({
            mutateAsync: mockMutateAsync,
            isPending: false,
        }),
    }));

    it('renders form fields', async () => {
        const { CreateBoardModal } = await import(
            '@/components/create-board-modal'
        );

        render(<CreateBoardModal open={true} onClose={() => { }} />);

        expect(screen.getByLabelText('Board Title')).toBeInTheDocument();
        expect(screen.getByLabelText('Description (optional)')).toBeInTheDocument();
        expect(screen.getByText('Create Board')).toBeInTheDocument();
        expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('submit button is disabled when title is empty', async () => {
        const { CreateBoardModal } = await import(
            '@/components/create-board-modal'
        );

        render(<CreateBoardModal open={true} onClose={() => { }} />);

        expect(screen.getByText('Create Board')).toBeDisabled();
    });

    it('submit creates a board and calls onClose', async () => {
        const onClose = vi.fn();
        mockMutateAsync.mockClear();
        const { CreateBoardModal } = await import(
            '@/components/create-board-modal'
        );

        render(<CreateBoardModal open={true} onClose={onClose} />);

        const titleInput = screen.getByLabelText('Board Title') as HTMLInputElement;
        // Use fireEvent for reliable value setting in happy-dom
        fireEvent.change(titleInput, { target: { value: 'TestBoard' } });

        // Submit via the button
        const submitBtn = screen.getByText('Create Board');
        fireEvent.click(submitBtn);

        await waitFor(() => {
            expect(mockMutateAsync).toHaveBeenCalled();
        });

        // Verify the board title was passed correctly
        const callArgs = mockMutateAsync.mock.calls[0]?.[0];
        expect(callArgs?.title).toBe('TestBoard');
    });
});
