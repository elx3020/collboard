'use client';

import { useState, lazy, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useBoards, useDeleteBoard } from '@/lib/hooks/use-queries';
import { Navbar } from '@/components/navbar';
import { Spinner, EmptyState } from '@/components/ui-shared';
import { BoardSection } from '@/components/dashboard/board-section';
import { groupBoards } from '@/lib/boards/group-boards';
import { BoardSettingsModal } from '@/components/dashboard/board-settings-modal';
import type { Board } from '@/lib/types';
import { GridIcon, PlusIcon } from '@/components/icons';

// Lazy load the modal — only downloaded when user clicks "New Board"
const CreateBoardModal = lazy(() =>
    import('@/components/create-board-modal').then((m) => ({ default: m.CreateBoardModal }))
);

export default function DashboardPage() {
    const { data: session } = useSession();
    const { data: boards, isLoading, error } = useBoards();
    const deleteBoard = useDeleteBoard();
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [settingsBoard, setSettingsBoard] = useState<Board | null>(null);

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
                        icon={<GridIcon className="h-12 w-12" strokeWidth={1.5} />}
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
                            id="owned"
                            title="My boards"
                            boards={grouped.owned}
                            emptyHint="Boards you create and keep to yourself will appear here."
                            onDelete={handleDelete}
                            onOpenSettings={setSettingsBoard}
                        />
                        <BoardSection
                            id="sharedByMe"
                            title="Shared by me"
                            boards={grouped.sharedByMe}
                            emptyHint="Once you invite someone to a board you own, it will appear here."
                            onDelete={handleDelete}
                            onOpenSettings={setSettingsBoard}
                        />
                        <BoardSection
                            id="sharedWithMe"
                            title="Shared with me"
                            boards={grouped.sharedWithMe}
                            emptyHint="When someone invites you to their board, it will appear here."
                            onDelete={handleDelete}
                            onOpenSettings={setSettingsBoard}
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

            <BoardSettingsModal
                board={settingsBoard}
                onClose={() => setSettingsBoard(null)}
            />
        </div>
    );
}
