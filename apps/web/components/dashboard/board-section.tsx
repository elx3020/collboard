'use client';

import type { Board } from '@/lib/types';
import { BoardCard } from '@/components/dashboard/board-card';

export function BoardSection({
    title,
    boards,
    emptyHint,
    onDelete,
    onOpenSettings,
}: {
    title: string;
    boards: Board[];
    emptyHint: string;
    onDelete: (boardId: string) => void;
    onOpenSettings: (board: Board) => void;
}) {
    if (boards.length === 0) return null;

    return (
        <section className="mb-10" aria-label={title}>
            <div className="mb-3 flex items-baseline gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    {title}
                </h2>
                <span className="text-xs text-[var(--muted-foreground)]">
                    {boards.length}
                </span>
            </div>

            <p className="sr-only">{emptyHint}</p>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {boards.map((board) => (
                    <BoardCard
                        key={board.id}
                        board={board}
                        onDelete={onDelete}
                        onOpenSettings={onOpenSettings}
                    />
                ))}
            </div>
        </section>
    );
}
