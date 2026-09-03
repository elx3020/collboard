'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { clsx } from 'clsx';
import { PriorityBadge, Avatar } from '@/components/ui-shared';
import { CommentIcon } from '@/components/icons';
import type { Task } from '@/lib/types';

interface TaskCardProps {
    task: Task;
    onClick: () => void;
    isDragOverlay?: boolean;
}

export function TaskCard({ task, onClick, isDragOverlay }: TaskCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: task.id,
        data: { type: 'task', task },
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={clsx(
                'group cursor-grab rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm transition-all hover:shadow-md hover:border-[var(--accent)]',
                isDragging && 'opacity-40',
                isDragOverlay && 'drag-overlay cursor-grabbing'
            )}
            onClick={onClick}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick();
                }
            }}
            role="button"
            tabIndex={0}
            aria-label={`Task: ${task.title}. Priority: ${task.priority}`}
        >
            {/* Priority + comment count */}
            <div className="mb-2 flex items-center justify-between">
                <PriorityBadge priority={task.priority} />
                {task._count?.comments ? (
                    <span className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                        <CommentIcon className="h-3.5 w-3.5" />
                        {task._count.comments}
                    </span>
                ) : null}
            </div>

            {/* Title */}
            <h4 className="text-sm font-medium text-[var(--foreground)] line-clamp-2">
                {task.title}
            </h4>

            {/* Description preview */}
            {task.description && (
                <p className="mt-1 text-xs text-[var(--muted-foreground)] line-clamp-4">
                    {task.description}
                </p>
            )}

            {/* Assignee */}
            {task.assignee && (
                <div className="mt-2 flex items-center gap-1.5">
                    <Avatar src={task.assignee.image} name={task.assignee.name} size="sm" />
                    <span className="text-xs text-[var(--muted-foreground)] truncate">
                        {task.assignee.name || task.assignee.email}
                    </span>
                </div>
            )}
        </div>
    );
}

/** Lightweight version for drag overlay */
export function TaskCardOverlay({ task }: { task: Task }) {
    return <TaskCard task={task} onClick={() => { }} isDragOverlay />;
}
