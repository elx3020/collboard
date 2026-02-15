'use client';

import { FormEvent, useState } from 'react';
import { Modal } from '@/components/modal';
import { useCreateTask } from '@/lib/hooks/use-queries';
import type { Priority } from '@/lib/types';

interface CreateTaskModalProps {
    open: boolean;
    onClose: () => void;
    boardId: string;
    columnId: string;
}

export function CreateTaskModal({ open, onClose, boardId, columnId }: CreateTaskModalProps) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState<Priority>('MEDIUM');
    const createTask = useCreateTask(boardId);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;

        await createTask.mutateAsync({
            title: title.trim(),
            description: description.trim() || undefined,
            columnId,
            priority,
        });

        setTitle('');
        setDescription('');
        setPriority('MEDIUM');
        onClose();
    };

    return (
        <Modal open={open} onClose={onClose} title="Create New Task">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="task-title" className="block text-sm font-medium text-[var(--foreground)]">
                        Task Title
                    </label>
                    <input
                        id="task-title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="What needs to be done?"
                        required
                        className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    />
                </div>

                <div>
                    <label htmlFor="task-description" className="block text-sm font-medium text-[var(--foreground)]">
                        Description (optional)
                    </label>
                    <textarea
                        id="task-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Add more details..."
                        rows={3}
                        className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] resize-none"
                    />
                </div>

                <div>
                    <label htmlFor="task-priority" className="block text-sm font-medium text-[var(--foreground)]">
                        Priority
                    </label>
                    <select
                        id="task-priority"
                        value={priority}
                        onChange={(e) => setPriority(e.target.value as Priority)}
                        className="mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    >
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                        <option value="URGENT">Urgent</option>
                    </select>
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
                        disabled={createTask.isPending || !title.trim()}
                        className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                        {createTask.isPending ? 'Creating...' : 'Create Task'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
