'use client';

import { useEffect, useState } from 'react';
import type { Board } from '@/lib/types';
import type { BoardGroupKey } from '@/lib/boards/group-boards';
import { BoardCard } from '@/components/dashboard/board-card';
import { ChevronDownIcon } from '@/components/icons';

const STORAGE_KEY = 'collboard.dashboard.collapsed';

/**
 * Collapsed sections are a per-browser convenience, so they live in
 * localStorage. Every access is guarded: private windows and blocked site
 * data make these throw, and a section that cannot remember its state should
 * still render — expanded.
 */
function readCollapsed(): string[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeCollapsed(ids: string[]) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {
        // Storage unavailable — collapsing still works for this session,
        // it just will not be remembered.
    }
}

export function BoardSection({
    id,
    title,
    boards,
    emptyHint,
    onDelete,
    onOpenSettings,
    onLeave,
}: {
    id: BoardGroupKey;
    title: string;
    boards: Board[];
    emptyHint: string;
    onDelete: (boardId: string) => void;
    onOpenSettings: (board: Board) => void;
    onLeave: (board: Board) => void;
}) {
    const [collapsed, setCollapsed] = useState(false);

    // Read in an effect rather than a lazy initialiser: the server render has
    // no localStorage, so seeding state from it directly would mismatch on
    // hydration.
    useEffect(() => {
        setCollapsed(readCollapsed().includes(id));
    }, [id]);

    const toggle = () => {
        const next = !collapsed;
        setCollapsed(next);

        const others = readCollapsed().filter((key) => key !== id);
        writeCollapsed(next ? [...others, id] : others);
    };

    const bodyId = `board-section-${id}`;

    return (
        <section className="mb-10" aria-label={title}>
            <h2 className="mb-3">
                <button
                    type="button"
                    onClick={toggle}
                    aria-expanded={!collapsed}
                    aria-controls={bodyId}
                    className="flex items-center gap-2 rounded-lg py-1 text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                >
                    <ChevronDownIcon
                        className={`h-4 w-4 transition-transform ${collapsed ? '-rotate-90' : ''}`}
                    />
                    <span>{title}</span>
                    <span className="text-xs font-normal normal-case tracking-normal">
                        {boards.length}
                    </span>
                </button>
            </h2>

            <div id={bodyId} hidden={collapsed}>
                {boards.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[var(--muted-foreground)]">
                        {emptyHint}
                    </p>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {boards.map((board) => (
                            <BoardCard
                                key={board.id}
                                board={board}
                                onDelete={onDelete}
                                onOpenSettings={onOpenSettings}
                                onLeave={onLeave}
                            />
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}
