'use client';

import Link from 'next/link';
import type React from 'react';
import type { Board } from '@/lib/types';
import { isBoardColor } from '@/lib/boards/board-colors';
import { ColumnsIcon, LeaveIcon, MoreHorizontalIcon, TrashIcon, UsersIcon } from '@/components/icons';

export function BoardCard({
    board,
    onDelete,
    onOpenSettings,
    onLeave,
}: {
    board: Board;
    onDelete: (boardId: string) => void;
    onOpenSettings: (board: Board) => void;
    onLeave: (board: Board) => void;
}) {
    const isOwner = board.currentUserRole === 'OWNER';
    // GET /api/boards returns only the current user's own membership row, so
    // this is the id the leave endpoint deletes. Absent for an owner, who has
    // no BoardMember row at all.
    const membershipId = board.members?.[0]?.id;
    // Guard again on render: the value reaches the DOM as a CSS variable name.
    const color = isBoardColor(board.color) ? board.color : null;
    // Overriding --muted-foreground on the card cascades to the description and
    // the meta counts, which both read it. The default grey drops below the 4.5
    // AA floor against these tints.
    const colorStyle = color
        ? ({
            background: `var(--board-${color})`,
            '--muted-foreground': 'var(--board-muted-foreground)',
        } as React.CSSProperties)
        : undefined;

    return (
        <Link
            href={`/boards/${board.id}`}
            style={colorStyle}
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
                        <MoreHorizontalIcon />
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
                        <TrashIcon />
                    </button>
                </div>
            )}

            {!isOwner && membershipId && (
                <div className="absolute right-3 top-3 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onLeave(board);
                        }}
                        className="rounded-lg p-1.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--destructive)]/15 hover:text-[var(--destructive)]"
                        aria-label="Leave board"
                    >
                        <LeaveIcon />
                    </button>
                </div>
            )}

            <h3 className="pr-16 text-lg font-semibold text-[var(--foreground)] transition-colors group-hover:text-[var(--accent)]">
                {board.title}
            </h3>

            {board.description && (
                <p className="mt-1 line-clamp-4 text-sm text-[var(--muted-foreground)]">
                    {board.description}
                </p>
            )}

            <div className="mt-4 flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                <span className="inline-flex items-center gap-1">
                    <ColumnsIcon className="h-3.5 w-3.5" />
                    {board._count?.columns ?? 0} columns
                </span>
                <span className="inline-flex items-center gap-1">
                    <UsersIcon className="h-3.5 w-3.5" />
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
