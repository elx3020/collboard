'use client';

import Link from 'next/link';
import type React from 'react';
import { clsx } from 'clsx';
import type { Board } from '@/lib/types';
import { isBoardColor } from '@/lib/boards/board-colors';
import { Avatar } from '@/components/ui-shared';
import { LeaveIcon, MoreHorizontalIcon, TrashIcon } from '@/components/icons';

/**
 * Fills for the load bar, cycled across columns. A tonal ramp rather than a set
 * of hues: every segment is separated by an ink rule, so they stay legible on a
 * colour-tinted card where a pale fill would otherwise disappear.
 */
const SEGMENT_FILLS = [
    'var(--accent)',
    'var(--foreground)',
    'var(--muted-foreground)',
    'var(--border)',
];

/** "1 member", "3 members" — the counts here are often 1. */
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Small uppercase meta text, as on the task and board settings modals. */
const META = 'text-[11px] uppercase tracking-[0.08em] text-[var(--muted-foreground)]';

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

    const columns = board.columnSummaries ?? [];
    const totalTasks = columns.reduce((n, c) => n + c.taskCount, 0);
    // A zero-width segment would still paint its divider rule, so empty columns
    // stay out of the bar and are read from the key beneath it instead.
    const filled = columns.filter((c) => c.taskCount > 0);

    const memberCount = board._count?.members ?? 0;
    const preview = board.memberPreview ?? [];
    const overflow = memberCount - preview.length;

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

            <div className="flex items-baseline justify-between gap-3 pr-16">
                <h3 className="text-lg font-semibold leading-snug text-[var(--foreground)] transition-colors group-hover:text-[var(--accent)]">
                    {board.title}
                </h3>
                {columns.length > 0 && (
                    <span className={clsx(META, 'flex-none')}>{plural(totalTasks, 'task')}</span>
                )}
            </div>

            {board.description && (
                <p className="mt-1 line-clamp-2 text-sm text-[var(--muted-foreground)]">
                    {board.description}
                </p>
            )}

            {columns.length > 0 && (
                <>
                    {/* One proportional bar for the whole board, so two cards can
                        be compared at a glance rather than read line by line. */}
                    <div
                        className="mt-4 flex h-2.5 overflow-hidden rounded-sm border border-[var(--foreground)]"
                        role="img"
                        aria-label={`Tasks by column: ${columns
                            .map((c) => `${c.title} ${c.taskCount}`)
                            .join(', ')}`}
                    >
                        {filled.map((column, i) => (
                            <div
                                key={column.id}
                                style={{
                                    width: `${(column.taskCount / totalTasks) * 100}%`,
                                    background: SEGMENT_FILLS[i % SEGMENT_FILLS.length],
                                }}
                                className="border-r border-[var(--foreground)] last:border-r-0"
                            />
                        ))}
                    </div>

                    <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1" aria-hidden="true">
                        {columns.map((column) => (
                            <span key={column.id} className="flex items-center gap-1.5">
                                <span
                                    style={{
                                        background:
                                            column.taskCount > 0
                                                ? SEGMENT_FILLS[
                                                      filled.indexOf(column) % SEGMENT_FILLS.length
                                                  ]
                                                : 'transparent',
                                    }}
                                    className="h-2.5 w-2.5 flex-none rounded-[2px] border border-[var(--foreground)]"
                                />
                                <span className="text-xs text-[var(--foreground)]">
                                    {column.title}
                                </span>
                                <span className="text-xs text-[var(--muted-foreground)]">
                                    {column.taskCount}
                                </span>
                            </span>
                        ))}
                    </div>
                </>
            )}

            <div className="mt-4 flex items-center gap-2 border-t border-[var(--border)] pt-3">
                {memberCount > 0 ? (
                    <>
                        <span className="flex flex-none items-center -space-x-1.5">
                            {preview.map((member) => (
                                <Avatar
                                    key={member.id}
                                    src={member.image}
                                    name={member.name || member.email}
                                    size="sm"
                                />
                            ))}
                            {overflow > 0 && (
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--foreground)] text-[10px] font-medium text-[var(--card)]">
                                    +{overflow}
                                </span>
                            )}
                        </span>
                        <span className={META}>{plural(memberCount, 'member')}</span>
                    </>
                ) : (
                    <span className={META}>No members yet</span>
                )}
                <span className={clsx(META, 'ml-auto flex-none')}>
                    {plural(board._count?.columns ?? 0, 'column')}
                </span>
            </div>
        </Link>
    );
}
