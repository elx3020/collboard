'use client';

import { useDroppable } from '@dnd-kit/core';
import {
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { clsx } from 'clsx';
import { useState } from 'react';
import { TaskCard } from '@/components/board/task-card';
import type { Column as ColumnType, Task } from '@/lib/types';

interface BoardColumnProps {
    column: ColumnType;
    tasks: Task[];
    onAddTask: (columnId: string) => void;
    onTaskClick: (task: Task) => void;
    onDeleteColumn?: (columnId: string) => void;
    onRenameColumn?: (columnId: string, title: string) => void;
}

export function BoardColumn({
    column,
    tasks,
    onAddTask,
    onTaskClick,
    onDeleteColumn,
    onRenameColumn,
}: BoardColumnProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState(column.title);

    const {
        attributes,
        listeners,
        setNodeRef: setSortableRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: `column-${column.id}`,
        data: { type: 'column', column },
    });

    const { setNodeRef: setDroppableRef, isOver } = useDroppable({
        id: column.id,
        data: { type: 'column', column },
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const taskIds = tasks.map((t) => t.id);

    const handleRename = () => {
        if (editTitle.trim() && editTitle.trim() !== column.title) {
            onRenameColumn?.(column.id, editTitle.trim());
        }
        setIsEditing(false);
    };

    return (
        <div
            ref={setSortableRef}
            style={style}
            className={clsx(
                'flex w-72 flex-shrink-0 flex-col rounded-xl bg-[var(--muted)] border border-[var(--border)]',
                isDragging && 'opacity-40',
                isOver && 'ring-2 ring-[var(--accent)]'
            )}
        >
            {/* Column Header */}
            <div
                className="flex items-center justify-between p-3 cursor-grab"
                {...attributes}
                {...listeners}
            >
                {isEditing ? (
                    <input
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onBlur={handleRename}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRename();
                            if (e.key === 'Escape') {
                                setEditTitle(column.title);
                                setIsEditing(false);
                            }
                        }}
                        className="w-full rounded border border-[var(--accent)] bg-[var(--background)] px-2 py-0.5 text-sm font-semibold text-[var(--foreground)] focus:outline-none"
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <h3
                        className="text-sm font-semibold text-[var(--foreground)] cursor-text"
                        onDoubleClick={() => {
                            setEditTitle(column.title);
                            setIsEditing(true);
                        }}
                    >
                        {column.title}
                        <span className="ml-2 text-xs font-normal text-[var(--muted-foreground)]">
                            {tasks.length}
                        </span>
                    </h3>
                )}

                <div className="flex items-center gap-1">
                    <button
                        onClick={() => onAddTask(column.id)}
                        className="rounded-md p-1 text-[var(--muted-foreground)] hover:bg-[var(--background)] hover:text-[var(--foreground)] transition-colors"
                        aria-label={`Add task to ${column.title}`}
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                        >
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                    </button>
                    {onDeleteColumn && (
                        <button
                            onClick={() => {
                                if (confirm(`Delete column "${column.title}" and all its tasks?`)) {
                                    onDeleteColumn(column.id);
                                }
                            }}
                            className="rounded-md p-1 text-[var(--muted-foreground)] hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 transition-colors"
                            aria-label={`Delete column ${column.title}`}
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth={2}
                            >
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* Tasks List */}
            <div
                ref={setDroppableRef}
                className={clsx(
                    'flex flex-1 flex-col gap-2 overflow-y-auto p-3 pt-0',
                    'min-h-[80px]'
                )}
            >
                <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
                    {tasks.map((task) => (
                        <TaskCard
                            key={task.id}
                            task={task}
                            onClick={() => onTaskClick(task)}
                        />
                    ))}
                </SortableContext>

                {tasks.length === 0 && (
                    <div className="flex flex-1 items-center justify-center py-8 text-xs text-[var(--muted-foreground)]">
                        Drop tasks here
                    </div>
                )}
            </div>
        </div>
    );
}
