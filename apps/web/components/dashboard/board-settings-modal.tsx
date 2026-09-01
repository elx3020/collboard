'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '@/components/modal';
import { useUpdateBoard } from '@/lib/hooks/use-queries';
import type { Board } from '@/lib/types';

const inputClass =
    'mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]';

export function BoardSettingsModal({
    board,
    onClose,
}: {
    board: Board | null;
    onClose: () => void;
}) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');

    // Re-seed the form whenever a different board is opened.
    useEffect(() => {
        if (board) {
            setTitle(board.title);
            setDescription(board.description ?? '');
        }
    }, [board]);

    const updateBoard = useUpdateBoard(board?.id ?? '');

    if (!board) return null;

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;

        updateBoard.mutate(
            { title: title.trim(), description: description.trim() },
            { onSuccess: onClose }
        );
    };

    return (
        <Modal open={!!board} onClose={onClose} title="Board Settings">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label
                        htmlFor="board-settings-title"
                        className="block text-sm font-medium text-[var(--foreground)]"
                    >
                        Name
                    </label>
                    <input
                        id="board-settings-title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        required
                        className={inputClass}
                    />
                </div>

                <div>
                    <label
                        htmlFor="board-settings-description"
                        className="block text-sm font-medium text-[var(--foreground)]"
                    >
                        Description
                    </label>
                    <textarea
                        id="board-settings-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        placeholder="What's this board for?"
                        className={`${inputClass} resize-none`}
                    />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={updateBoard.isPending || !title.trim()}
                        className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                        {updateBoard.isPending ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
