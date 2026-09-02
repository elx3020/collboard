'use client';

import { FormEvent, useRef, useState } from 'react';
import { Modal } from '@/components/modal';
import { Avatar, Spinner } from '@/components/ui-shared';
import {
    useComments,
    useCreateComment,
    useDeleteComment,
    useUpdateTask,
    useDeleteTask,
} from '@/lib/hooks/use-queries';
import type { Task, Priority, UpdateTaskRequest } from '@/lib/types';

interface TaskDetailModalProps {
    open: boolean;
    onClose: () => void;
    task: Task;
    boardId: string;
}

export function TaskDetailModal({ open, onClose, task, boardId }: TaskDetailModalProps) {
    const [editTitle, setEditTitle] = useState(task.title);
    const [editDescription, setEditDescription] = useState(task.description || '');
    const [editPriority, setEditPriority] = useState<Priority>(task.priority);
    const [commentText, setCommentText] = useState('');
    const deletedRef = useRef(false);

    const { data: comments, isLoading: commentsLoading } = useComments(boardId, task.id);
    const createComment = useCreateComment(boardId, task.id);
    const deleteComment = useDeleteComment(boardId, task.id);
    const updateTask = useUpdateTask(boardId);
    const deleteTask = useDeleteTask(boardId);

    /** Only the fields that actually changed — empty object means no API call. */
    const getChanges = (): UpdateTaskRequest => {
        const changes: UpdateTaskRequest = {};
        const title = editTitle.trim();
        const description = editDescription.trim();

        if (title && title !== task.title) changes.title = title;
        if (description !== (task.description || '').trim()) changes.description = description;
        if (editPriority !== task.priority) changes.priority = editPriority;

        return changes;
    };

    const handleClose = () => {
        if (!deletedRef.current) {
            const changes = getChanges();
            if (Object.keys(changes).length > 0) {
                updateTask.mutate({ taskId: task.id, data: changes });
            }
        }
        onClose();
    };

    const handleDelete = async () => {
        if (!confirm('Delete this task?')) return;
        deletedRef.current = true;
        await deleteTask.mutateAsync(task.id);
        onClose();
    };

    const handleAddComment = async (e: FormEvent) => {
        e.preventDefault();
        if (!commentText.trim()) return;
        await createComment.mutateAsync({ content: commentText.trim() });
        setCommentText('');
    };

    return (
        <Modal open={open} onClose={handleClose} title={task.title} size="lg">
            <div className="space-y-5">
                {/* Task Details — always editable, saved on close */}
                <div className="space-y-3">
                    <input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        aria-label="Task title"
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                    />
                    <textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        rows={3}
                        placeholder="Add description..."
                        aria-label="Task description"
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] resize-none"
                    />
                    <div className="flex flex-wrap items-center gap-3">
                        <select
                            value={editPriority}
                            onChange={(e) => setEditPriority(e.target.value as Priority)}
                            aria-label="Task priority"
                            className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none"
                        >
                            <option value="LOW">Low</option>
                            <option value="MEDIUM">Medium</option>
                            <option value="HIGH">High</option>
                            <option value="URGENT">Urgent</option>
                        </select>

                        {task.assignee && (
                            <div className="flex items-center gap-1.5">
                                <Avatar src={task.assignee.image} name={task.assignee.name} size="sm" />
                                <span className="text-sm text-[var(--muted-foreground)]">
                                    {task.assignee.name || task.assignee.email}
                                </span>
                            </div>
                        )}

                        <button
                            onClick={handleDelete}
                            className="ml-auto rounded-lg border border-red-300 dark:border-red-800 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                            Delete
                        </button>
                    </div>
                </div>

                {/* Divider */}
                <div className="border-t border-[var(--border)]" />

                {/* Comments */}
                <div>
                    <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">
                        Comments {comments ? `(${comments.length})` : ''}
                    </h3>

                    {commentsLoading && <Spinner size="sm" />}

                    {comments && comments.length > 0 && (
                        <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
                            {comments.map((comment) => (
                                <div
                                    key={comment.id}
                                    className="flex gap-2 rounded-lg bg-[var(--background)] p-3"
                                >
                                    <Avatar
                                        src={comment.user.image}
                                        name={comment.user.name}
                                        size="sm"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-xs font-medium text-[var(--foreground)]">
                                                {comment.user.name || comment.user.email}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-[var(--muted-foreground)]">
                                                    {new Date(comment.createdAt).toLocaleDateString()}
                                                </span>
                                                <button
                                                    onClick={() => deleteComment.mutate(comment.id)}
                                                    className="text-xs text-[var(--muted-foreground)] hover:text-red-500"
                                                    aria-label="Delete comment"
                                                >
                                                    &times;
                                                </button>
                                            </div>
                                        </div>
                                        <p className="mt-0.5 text-sm text-[var(--foreground)] whitespace-pre-wrap">
                                            {comment.content}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* New Comment */}
                    <form onSubmit={handleAddComment} className="flex gap-2">
                        <input
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            placeholder="Add a comment..."
                            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                        />
                        <button
                            type="submit"
                            disabled={createComment.isPending || !commentText.trim()}
                            className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm text-[var(--accent-foreground)] hover:opacity-90 disabled:opacity-50"
                        >
                            Post
                        </button>
                    </form>
                </div>
            </div>
        </Modal>
    );
}
