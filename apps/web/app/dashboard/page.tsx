'use client';

import { useState, lazy, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useBoards, useDeleteBoard } from '@/lib/hooks/use-queries';
import { Navbar } from '@/components/navbar';
import { Spinner, EmptyState } from '@/components/ui-shared';
import { BoardSection } from '@/components/dashboard/board-section';
import { groupBoards } from '@/lib/boards/group-boards';

// Lazy load the modal — only downloaded when user clicks "New Board"
const CreateBoardModal = lazy(() =>
    import('@/components/create-board-modal').then((m) => ({ default: m.CreateBoardModal }))
);

// Task 4 replaces this with real settings-modal state.
const NOOP_OPEN_SETTINGS = () => {};

function PlusIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
        >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
    );
}

function BoardsIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-12 w-12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
        >
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
    );
}

export default function DashboardPage() {
    const { data: session } = useSession();
    const { data: boards, isLoading, error } = useBoards();
    const deleteBoard = useDeleteBoard();
    const [createModalOpen, setCreateModalOpen] = useState(false);

    const currentUserId = session?.user?.id ?? '';
    const grouped = groupBoards(boards ?? [], currentUserId);

    const handleDelete = (boardId: string) => {
        if (confirm('Delete this board? This cannot be undone.')) {
            deleteBoard.mutate(boardId);
        }
    };

    return (
        <div className="min-h-screen bg-[var(--background)]">
            <Navbar />
            <main className="mx-auto max-w-screen-xl px-4 py-8 sm:px-6">
                <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-[var(--foreground)] sm:text-3xl">
                            My Boards
                        </h1>
                        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                            Manage your Kanban boards
                        </p>
                    </div>
                    <button
                        onClick={() => setCreateModalOpen(true)}
                        className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--accent-foreground)] transition-opacity hover:opacity-90"
                    >
                        <PlusIcon />
                        New Board
                    </button>
                </div>

                {isLoading && (
                    <div className="flex items-center justify-center py-20">
                        <Spinner size="lg" />
                    </div>
                )}

                {error && (
                    <div className="rounded-lg border border-[var(--destructive)] bg-[var(--destructive)]/10 p-4 text-sm text-[var(--foreground)]">
                        Failed to load boards: {error.message}
                    </div>
                )}

                {boards && boards.length === 0 && (
                    <EmptyState
                        icon={<BoardsIcon />}
                        title="No boards yet"
                        description="Create your first Kanban board to get started."
                        action={
                            <button
                                onClick={() => setCreateModalOpen(true)}
                                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-foreground)] transition-opacity hover:opacity-90"
                            >
                                Create Board
                            </button>
                        }
                    />
                )}

                {boards && boards.length > 0 && (
                    <>
                        <BoardSection
                            title="My boards"
                            boards={grouped.owned}
                            emptyHint="Boards you own that are not shared with anyone."
                            onDelete={handleDelete}
                            onOpenSettings={NOOP_OPEN_SETTINGS}
                        />
                        <BoardSection
                            title="Shared by me"
                            boards={grouped.sharedByMe}
                            emptyHint="Boards you own and have invited others to."
                            onDelete={handleDelete}
                            onOpenSettings={NOOP_OPEN_SETTINGS}
                        />
                        <BoardSection
                            title="Shared with me"
                            boards={grouped.sharedWithMe}
                            emptyHint="Boards owned by other people that you can access."
                            onDelete={handleDelete}
                            onOpenSettings={NOOP_OPEN_SETTINGS}
                        />
                    </>
                )}
            </main>

            <Suspense fallback={null}>
                <CreateBoardModal
                    open={createModalOpen}
                    onClose={() => setCreateModalOpen(false)}
                />
            </Suspense>
        </div>
    );
}
