'use client';

import { FormEvent, useState } from 'react';
import { Modal } from '@/components/modal';
import { useCreateBoard } from '@/lib/hooks/use-queries';

interface CreateBoardModalProps {
    open: boolean;
    onClose: () => void;
}

export function CreateBoardModal({ open, onClose }: CreateBoardModalProps) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const createBoard = useCreateBoard();

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;

        await createBoard.mutateAsync({
            title: title.trim(),
            description: description.trim() || undefined,
        });

        setTitle('');
        setDescription('');
        onClose();
    };

    return (
        <Modal open={open} onClose={onClose} title="Create New Board">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label
                        htmlFor="board-title"
                        className="block text-sm font-medium text-[var(--foreground)]"
                    >
                        Board Title
                    </label>
                    <input
                        id="board-title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="My Project Board"
                        required
                        className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    />
                </div>
                <div>
                    <label
                        htmlFor="board-description"
                        className="block text-sm font-medium text-[var(--foreground)]"
                    >
                        Description (optional)
                    </label>
                    <textarea
                        id="board-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="What's this board for?"
                        rows={3}
                        className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] resize-none"
                    />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={createBoard.isPending || !title.trim()}
                        className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                        {createBoard.isPending ? 'Creating...' : 'Create Board'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
