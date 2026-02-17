'use client';

import { useState, lazy, Suspense } from 'react';
import Link from 'next/link';
import { useBoards, useDeleteBoard } from '@/lib/hooks/use-queries';
import { Navbar } from '@/components/navbar';
import { Spinner, EmptyState } from '@/components/ui-shared';

// Lazy load the modal — only downloaded when user clicks "New Board"
const CreateBoardModal = lazy(() =>
    import('@/components/create-board-modal').then((m) => ({ default: m.CreateBoardModal }))
);

export default function DashboardPage() {
    const { data: boards, isLoading, error } = useBoards();
    const deleteBoard = useDeleteBoard();
    const [createModalOpen, setCreateModalOpen] = useState(false);

    return (
        <div className="min-h-screen bg-[var(--background)]">
            <Navbar />
            <main className="mx-auto max-w-screen-xl px-4 py-8 sm:px-6">
                {/* Header */}
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
                        className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        New Board
                    </button>
                </div>

                {/* Loading */}
                {isLoading && (
                    <div className="flex items-center justify-center py-20">
                        <Spinner size="lg" />
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-400">
                        Failed to load boards: {error.message}
                    </div>
                )}

                {/* Empty State */}
                {boards && boards.length === 0 && (
                    <EmptyState
                        icon={
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-12 w-12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={1.5}
                            >
                                <rect x="3" y="3" width="7" height="7" rx="1" />
                                <rect x="14" y="3" width="7" height="7" rx="1" />
                                <rect x="3" y="14" width="7" height="7" rx="1" />
                                <rect x="14" y="14" width="7" height="7" rx="1" />
                            </svg>
                        }
                        title="No boards yet"
                        description="Create your first Kanban board to get started."
                        action={
                            <button
                                onClick={() => setCreateModalOpen(true)}
                                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
                            >
                                Create Board
                            </button>
                        }
                    />
                )}

                {/* Board Grid */}
                {boards && boards.length > 0 && (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {boards.map((board) => (
                            <Link
                                key={board.id}
                                href={`/boards/${board.id}`}
                                className="group relative rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm hover:shadow-md hover:border-[var(--accent)] transition-all"
                            >
                                {/* Delete button */}
                                {board.currentUserRole === 'OWNER' && (
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            if (confirm('Delete this board? This cannot be undone.')) {
                                                deleteBoard.mutate(board.id);
                                            }
                                        }}
                                        className="absolute right-3 top-3 rounded-lg p-1.5 text-[var(--muted-foreground)] opacity-0 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 group-hover:opacity-100 transition-all"
                                        aria-label="Delete board"
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="h-4 w-4"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth={2}
                                        >
                                            <polyline points="3,6 5,6 21,6" />
                                            <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6" />
                                        </svg>
                                    </button>
                                )}

                                <h3 className="text-lg font-semibold text-[var(--foreground)] group-hover:text-[var(--accent)] transition-colors">
                                    {board.title}
                                </h3>

                                {board.description && (
                                    <p className="mt-1 text-sm text-[var(--muted-foreground)] line-clamp-2">
                                        {board.description}
                                    </p>
                                )}

                                <div className="mt-4 flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                                    <span className="inline-flex items-center gap-1">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="h-3.5 w-3.5"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth={2}
                                        >
                                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                            <line x1="3" y1="9" x2="21" y2="9" />
                                            <line x1="9" y1="21" x2="9" y2="9" />
                                        </svg>
                                        {board._count?.columns ?? 0} columns
                                    </span>
                                    <span className="inline-flex items-center gap-1">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="h-3.5 w-3.5"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth={2}
                                        >
                                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                            <circle cx="9" cy="7" r="4" />
                                            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                                        </svg>
                                        {board.members?.length ?? 0} members
                                    </span>
                                    <span
                                        className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs font-medium"
                                        role="status"
                                    >
                                        {board.currentUserRole}
                                    </span>
                                </div>
                            </Link>
                        ))}
                    </div>
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
