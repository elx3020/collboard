'use client';

import { FormEvent, useState } from 'react';
import { Modal } from '@/components/modal';
import { PriorityBadge, Avatar, Spinner } from '@/components/ui-shared';
import {
    useComments,
    useCreateComment,
    useDeleteComment,
    useUpdateTask,
    useDeleteTask,
} from '@/lib/hooks/use-queries';
import type { Task, Priority } from '@/lib/types';

interface TaskDetailModalProps {
    open: boolean;
    onClose: () => void;
    task: Task;
    boardId: string;
}

export function TaskDetailModal({ open, onClose, task, boardId }: TaskDetailModalProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState(task.title);
    const [editDescription, setEditDescription] = useState(task.description || '');
    const [editPriority, setEditPriority] = useState<Priority>(task.priority);
    const [commentText, setCommentText] = useState('');

    const { data: comments, isLoading: commentsLoading } = useComments(boardId, task.id);
    const createComment = useCreateComment(boardId, task.id);
    const deleteComment = useDeleteComment(boardId, task.id);
    const updateTask = useUpdateTask(boardId);
    const deleteTask = useDeleteTask(boardId);

    const handleSave = async () => {
        await updateTask.mutateAsync({
            taskId: task.id,
            data: {
                title: editTitle.trim(),
                description: editDescription.trim() || undefined,
                priority: editPriority,
            },
        });
        setIsEditing(false);
    };

    const handleDelete = async () => {
        if (!confirm('Delete this task?')) return;
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
        <Modal open={open} onClose={onClose} title={isEditing ? 'Edit Task' : task.title} size="lg">
            <div className="space-y-5">
                {/* Task Details */}
                {isEditing ? (
                    <div className="space-y-3">
                        <input
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                        />
                        <textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            rows={3}
                            placeholder="Add description..."
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] resize-none"
                        />
                        <select
                            value={editPriority}
                            onChange={(e) => setEditPriority(e.target.value as Priority)}
                            className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none"
                        >
                            <option value="LOW">Low</option>
                            <option value="MEDIUM">Medium</option>
                            <option value="HIGH">High</option>
                            <option value="URGENT">Urgent</option>
                        </select>
                        <div className="flex gap-2">
                            <button
                                onClick={handleSave}
                                disabled={updateTask.isPending}
                                className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
                            >
                                {updateTask.isPending ? 'Saving...' : 'Save'}
                            </button>
                            <button
                                onClick={() => setIsEditing(false)}
                                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--foreground)] hover:bg-[var(--muted)]"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <div>
                        <div className="flex items-center gap-3 mb-3">
                            <PriorityBadge priority={task.priority} />
                            {task.assignee && (
                                <div className="flex items-center gap-1.5">
                                    <Avatar src={task.assignee.image} name={task.assignee.name} size="sm" />
                                    <span className="text-sm text-[var(--muted-foreground)]">
                                        {task.assignee.name || task.assignee.email}
                                    </span>
                                </div>
                            )}
                        </div>

                        {task.description && (
                            <p className="text-sm text-[var(--foreground)] whitespace-pre-wrap">
                                {task.description}
                            </p>
                        )}

                        <div className="mt-3 flex gap-2">
                            <button
                                onClick={() => {
                                    setEditTitle(task.title);
                                    setEditDescription(task.description || '');
                                    setEditPriority(task.priority);
                                    setIsEditing(true);
                                }}
                                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
                            >
                                Edit
                            </button>
                            <button
                                onClick={handleDelete}
                                className="rounded-lg border border-red-300 dark:border-red-800 px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                )}

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
                            className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
                        >
                            Post
                        </button>
                    </form>
                </div>
            </div>
        </Modal>
    );
}
