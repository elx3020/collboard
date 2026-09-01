'use client';

import Link from 'next/link';
import type { Board } from '@/lib/types';

function ColumnsIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
        >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
    );
}

function MembersIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
        >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    );
}

export function BoardCard({
    board,
    onDelete,
    onOpenSettings,
}: {
    board: Board;
    onDelete: (boardId: string) => void;
    onOpenSettings: (board: Board) => void;
}) {
    const isOwner = board.currentUserRole === 'OWNER';

    return (
        <Link
            href={`/boards/${board.id}`}
            className="group relative rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm transition-all hover:border-[var(--accent)] hover:shadow-md"
        >
            {isOwner && (
                <div className="absolute right-3 top-3 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onOpenSettings(board);
                        }}
                        className="rounded-lg p-1.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                        aria-label="Board settings"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            aria-hidden="true"
                        >
                            <circle cx="5" cy="12" r="1.5" />
                            <circle cx="12" cy="12" r="1.5" />
                            <circle cx="19" cy="12" r="1.5" />
                        </svg>
                    </button>

                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDelete(board.id);
                        }}
                        className="rounded-lg p-1.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--destructive)]/15 hover:text-[var(--destructive)]"
                        aria-label="Delete board"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            aria-hidden="true"
                        >
                            <polyline points="3,6 5,6 21,6" />
                            <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6" />
                        </svg>
                    </button>
                </div>
            )}

            <h3 className="pr-16 text-lg font-semibold text-[var(--foreground)] transition-colors group-hover:text-[var(--accent)]">
                {board.title}
            </h3>

            {board.description && (
                <p className="mt-1 line-clamp-2 text-sm text-[var(--muted-foreground)]">
                    {board.description}
                </p>
            )}

            <div className="mt-4 flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                <span className="inline-flex items-center gap-1">
                    <ColumnsIcon />
                    {board._count?.columns ?? 0} columns
                </span>
                <span className="inline-flex items-center gap-1">
                    <MembersIcon />
                    {board._count?.members ?? 0} members
                </span>
                <span
                    className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs font-medium"
                    role="status"
                >
                    {board.currentUserRole}
                </span>
            </div>
        </Link>
    );
}
