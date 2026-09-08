'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Modal } from '@/components/modal';
import { Avatar, Spinner } from '@/components/ui-shared';
import {
    useComments,
    useCreateComment,
    useDeleteComment,
    useUpdateTask,
    useDeleteTask,
} from '@/lib/hooks/use-queries';
import { AssigneePicker } from '@/components/board/assignee-picker';
import {
    CircleIcon,
    CheckCircleIcon,
    ArchiveIcon,
    CloseIcon,
    CommentIcon,
    ChevronLeftIcon,
} from '@/components/icons';
import { formatRelativeTime } from '@/lib/utils/relative-time';
import { fitToContent } from '@/lib/utils/fit-to-content';
import type { Task, Priority, TaskStatus, UpdateTaskRequest } from '@/lib/types';

/** The three statuses, in the order they appear in the modal. */
const STATUS_OPTIONS: { value: TaskStatus; label: string; Icon: typeof CircleIcon }[] = [
    { value: 'INCOMPLETED', label: 'Incompleted', Icon: CircleIcon },
    { value: 'COMPLETED', label: 'Completed', Icon: CheckCircleIcon },
    { value: 'ARCHIVED', label: 'Archived', Icon: ArchiveIcon },
];

/** How many of the four meter bars each priority fills. */
const PRIORITY_STEPS: Record<Priority, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, URGENT: 4 };

/**
 * The rail's small uppercase field name. Tracked and quiet — it names the row
 * without competing with the value underneath it.
 */
const RAIL_LABEL =
    'text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--muted-foreground)]';

/** A select that reads as plain text until it is hovered or focused. */
const FLUSH_SELECT =
    '-mx-1 w-full cursor-pointer rounded-md border border-transparent bg-transparent px-1 py-1 text-sm font-medium text-[var(--foreground)] hover:border-[var(--border)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]';

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
    const [editStatus, setEditStatus] = useState<TaskStatus>(task.status);
    const [editAssigneeId, setEditAssigneeId] = useState<string | null>(task.assigneeId);
    const [commentText, setCommentText] = useState('');
    // Below `lg` the three panes stack and the rail is always shown, so this
    // only governs the wide layout.
    const [commentsOpen, setCommentsOpen] = useState(true);
    const deletedRef = useRef(false);
    const titleRef = useRef<HTMLTextAreaElement>(null);

    // The title is a textarea, not an input, so a long one wraps into the
    // display block instead of scrolling out of sight.
    useEffect(() => {
        fitToContent(titleRef.current);
    }, [editTitle, open]);

    const { data: comments, isLoading: commentsLoading } = useComments(boardId, task.id);
    const createComment = useCreateComment(boardId, task.id);
    const deleteComment = useDeleteComment(boardId, task.id);
    const updateTask = useUpdateTask(boardId);
    const deleteTask = useDeleteTask(boardId);

    const commentCount = comments?.length ?? task._count?.comments ?? 0;

    /** Only the fields that actually changed — empty object means no API call. */
    const getChanges = (): UpdateTaskRequest => {
        const changes: UpdateTaskRequest = {};
        const title = editTitle.trim();
        const description = editDescription.trim();

        if (title && title !== task.title) changes.title = title;
        if (description !== (task.description || '').trim()) changes.description = description;
        if (editPriority !== task.priority) changes.priority = editPriority;
        if (editStatus !== task.status) changes.status = editStatus;
        // null is a meaningful value here — it unassigns — so this compares
        // against the task's own null rather than testing for truthiness.
        if (editAssigneeId !== task.assigneeId) changes.assigneeId = editAssigneeId;

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
        <Modal open={open} onClose={handleClose} title={task.title} size="2xl" chrome={false}>
            <div className="flex h-[min(46rem,85vh)] flex-col text-[var(--foreground)]">
                {/* Identifier strip. The title itself lives in the centre pane. */}
                <header className="flex flex-none items-center justify-between border-b border-[var(--border)] px-6 py-3">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--muted-foreground)]">
                        Task
                    </span>
                    <button
                        onClick={handleClose}
                        className="rounded-lg p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                        aria-label="Close"
                    >
                        <CloseIcon className="h-5 w-5" />
                    </button>
                </header>

                <div
                    className={clsx(
                        'flex min-h-0 flex-1 flex-col overflow-y-auto lg:grid lg:overflow-visible',
                        commentsOpen
                            ? 'lg:grid-cols-[15rem_minmax(0,1fr)_23rem]'
                            : 'lg:grid-cols-[15rem_minmax(0,1fr)_3rem]'
                    )}
                >
                    {/* Properties rail */}
                    <aside className="flex flex-none flex-col border-b border-[var(--border)] px-6 py-5 lg:border-b-0 lg:border-r">
                        <div className="border-b border-[var(--border)] pb-4">
                            <div className={RAIL_LABEL}>Status</div>
                            <div
                                role="group"
                                aria-label="Task status"
                                className="mt-2 flex flex-wrap gap-1.5 lg:flex-col"
                            >
                                {STATUS_OPTIONS.map(({ value, label, Icon }) => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => setEditStatus(value)}
                                        aria-pressed={editStatus === value}
                                        className={clsx(
                                            'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-colors',
                                            editStatus === value
                                                ? 'border-[var(--accent)] bg-[var(--accent)] font-medium text-[var(--accent-foreground)]'
                                                : 'border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--accent)] hover:text-[var(--foreground)]'
                                        )}
                                    >
                                        <Icon className="h-4 w-4 flex-none" />
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="border-b border-[var(--border)] py-4">
                            <div className={RAIL_LABEL}>Priority</div>
                            <div className="mt-2 flex items-center gap-3">
                                <div className="flex flex-none gap-0.5" aria-hidden="true">
                                    {[0, 1, 2, 3].map((step) => (
                                        <span
                                            key={step}
                                            className={clsx(
                                                'h-5 w-2 rounded-[2px]',
                                                step < PRIORITY_STEPS[editPriority]
                                                    ? 'bg-[var(--foreground)]'
                                                    : 'bg-[var(--border)]'
                                            )}
                                        />
                                    ))}
                                </div>
                                <select
                                    value={editPriority}
                                    onChange={(e) => setEditPriority(e.target.value as Priority)}
                                    aria-label="Task priority"
                                    className={FLUSH_SELECT}
                                >
                                    <option value="LOW">Low</option>
                                    <option value="MEDIUM">Medium</option>
                                    <option value="HIGH">High</option>
                                    <option value="URGENT">Urgent</option>
                                </select>
                            </div>
                        </div>

                        <div className="border-b border-[var(--border)] py-4">
                            <div className={RAIL_LABEL}>Assignee</div>
                            <div className="mt-2 flex items-center gap-2.5">
                                <Avatar
                                    src={task.assignee?.image}
                                    name={task.assignee?.name}
                                    size="md"
                                />
                                <AssigneePicker
                                    boardId={boardId}
                                    value={editAssigneeId}
                                    onChange={setEditAssigneeId}
                                    className={FLUSH_SELECT}
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleDelete}
                            className="mt-4 rounded-lg border border-[var(--destructive)] px-3 py-2 text-sm font-medium text-[var(--destructive)] transition-colors hover:bg-[var(--destructive)] hover:text-[var(--card)] lg:mt-auto"
                        >
                            Delete task
                        </button>
                    </aside>

                    {/* Title and description */}
                    <main className="flex min-h-0 flex-none flex-col border-b border-[var(--border)] px-7 py-6 lg:flex-1 lg:overflow-y-auto lg:border-b-0">
                        <textarea
                            ref={titleRef}
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            rows={1}
                            aria-label="Task title"
                            className="-mx-2 flex-none resize-none overflow-hidden rounded-lg border border-transparent bg-transparent px-2 py-1 text-3xl font-bold leading-tight tracking-tight text-[var(--foreground)]"
                        />

                        <div className="mt-5 mb-4 h-px bg-[var(--border)]" />

                        <div className={RAIL_LABEL}>Description</div>
                        <textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            rows={6}
                            placeholder="What needs to happen?"
                            aria-label="Task description"
                            className="-mx-2 mt-2 min-h-32 flex-1 resize-none rounded-lg border border-transparent bg-transparent px-2 py-1 text-[15px] leading-relaxed text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]"
                        />

                        <div className="mt-4 flex flex-none flex-wrap gap-x-7 gap-y-1 border-t border-[var(--border)] pt-3 text-xs text-[var(--muted-foreground)]">
                            <span>
                                Created{' '}
                                {new Date(task.createdAt).toLocaleDateString(undefined, {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                })}
                            </span>
                            <span>Updated {formatRelativeTime(task.updatedAt)} ago</span>
                            <span>
                                {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
                            </span>
                        </div>
                    </main>

                    {/* Comments panel */}
                    <section className="flex min-h-0 flex-none flex-col border-[var(--border)] lg:flex-1 lg:border-l">
                        {!commentsOpen && (
                            <button
                                type="button"
                                onClick={() => setCommentsOpen(true)}
                                aria-expanded={false}
                                className="hidden h-full w-full flex-col items-center gap-3 py-4 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] lg:flex"
                            >
                                <CommentIcon className="h-4 w-4" />
                                <span className="text-[11px] uppercase tracking-[0.12em] [writing-mode:vertical-rl]">
                                    Comments ({commentCount})
                                </span>
                            </button>
                        )}

                        <div className={clsx('flex min-h-0 flex-1 flex-col', !commentsOpen && 'lg:hidden')}>
                            <div className="flex flex-none items-center gap-2 border-b border-[var(--border)] px-5 py-3">
                                <CommentIcon className="h-4 w-4 text-[var(--muted-foreground)]" />
                                <h3 className="text-[11px] font-medium uppercase tracking-[0.12em]">
                                    Comments{' '}
                                    <span className="text-[var(--muted-foreground)]">
                                        ({commentCount})
                                    </span>
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => setCommentsOpen(false)}
                                    aria-expanded
                                    aria-label="Hide comments"
                                    className="ml-auto hidden rounded-md p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] lg:block"
                                >
                                    <ChevronLeftIcon className="h-4 w-4 rotate-180" />
                                </button>
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto px-5">
                                {commentsLoading && (
                                    <div className="py-5">
                                        <Spinner size="sm" />
                                    </div>
                                )}

                                {!commentsLoading && commentCount === 0 && (
                                    <p className="py-5 text-sm text-[var(--muted-foreground)]">
                                        No comments yet. Start the thread below.
                                    </p>
                                )}

                                {comments?.map((comment) => (
                                    <article
                                        key={comment.id}
                                        className="group border-b border-[var(--border)] py-4 last:border-b-0"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Avatar
                                                src={comment.user.image}
                                                name={comment.user.name}
                                                size="sm"
                                            />
                                            <span className="truncate text-xs font-semibold">
                                                {comment.user.name || comment.user.email}
                                            </span>
                                            <span className="ml-auto flex-none text-xs text-[var(--muted-foreground)]">
                                                {formatRelativeTime(comment.createdAt)}
                                            </span>
                                            <button
                                                onClick={() => deleteComment.mutate(comment.id)}
                                                className="flex-none rounded p-0.5 text-[var(--muted-foreground)] opacity-0 transition-opacity hover:text-[var(--destructive)] focus-visible:opacity-100 group-hover:opacity-100"
                                                aria-label="Delete comment"
                                            >
                                                <CloseIcon className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                        <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed">
                                            {comment.content}
                                        </p>
                                    </article>
                                ))}
                            </div>

                            <form
                                onSubmit={handleAddComment}
                                className="flex-none border-t border-[var(--border)] p-4"
                            >
                                <textarea
                                    value={commentText}
                                    onChange={(e) => setCommentText(e.target.value)}
                                    rows={2}
                                    placeholder="Write a comment"
                                    aria-label="New comment"
                                    className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]"
                                />
                                <div className="mt-2 flex justify-end">
                                    <button
                                        type="submit"
                                        disabled={createComment.isPending || !commentText.trim()}
                                        className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
                                    >
                                        Post
                                    </button>
                                </div>
                            </form>
                        </div>
                    </section>
                </div>
            </div>
        </Modal>
    );
}
