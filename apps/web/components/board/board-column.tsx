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
import { CloseIcon, PlusIcon, FilterIcon } from '@/components/icons';
import type { Column as ColumnType, Task, UpdateTaskRequest, AssignableMember } from '@/lib/types';

/**
 * Per-column filters, from option 1b.
 *
 * Presentation only for now — nothing here narrows the task list yet, and no
 * endpoint backs it. Selecting one shows the active state so the design can be
 * reviewed; wiring comes later.
 */
const COLUMN_FILTERS: { label: string; hint: string }[] = [
    { label: 'High & urgent only', hint: 'priority' },
    { label: 'Assigned to me', hint: 'assignee' },
    { label: 'Has comments', hint: 'activity' },
    { label: 'Updated this week', hint: 'date' },
];

interface BoardColumnProps {
    column: ColumnType;
    tasks: Task[];
    onAddTask: (columnId: string) => void;
    onTaskClick: (task: Task) => void;
    onToggleStatus?: (task: Task) => void;
    onUpdateTask?: (task: Task, data: UpdateTaskRequest) => void;
    assignees?: AssignableMember[];
    onDeleteColumn?: (columnId: string) => void;
    onRenameColumn?: (columnId: string, title: string) => void;
}

export function BoardColumn({
    column,
    tasks,
    onAddTask,
    onTaskClick,
    onToggleStatus,
    onUpdateTask,
    assignees,
    onDeleteColumn,
    onRenameColumn,
}: BoardColumnProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState(column.title);
    const [filterOpen, setFilterOpen] = useState(false);
    const [activeFilter, setActiveFilter] = useState<string | null>(null);

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

                <div className="relative flex items-center gap-1">
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setFilterOpen(!filterOpen);
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        aria-label={`Filter ${column.title}`}
                        aria-expanded={filterOpen}
                        aria-haspopup="menu"
                        className={clsx(
                            'rounded-md p-1 transition-colors hover:bg-[var(--background)] hover:text-[var(--foreground)]',
                            activeFilter
                                ? 'text-[var(--accent-foreground)] bg-[var(--accent)]'
                                : 'text-[var(--muted-foreground)]'
                        )}
                    >
                        <FilterIcon />
                    </button>

                    {filterOpen && (
                        <div
                            role="menu"
                            aria-label="Filter column"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg"
                        >
                            <div className="px-3 py-1 text-[10px] uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
                                Filter column
                            </div>
                            {COLUMN_FILTERS.map(({ label, hint }) => (
                                <button
                                    key={label}
                                    type="button"
                                    role="menuitemradio"
                                    aria-checked={activeFilter === label}
                                    onClick={() => {
                                        setActiveFilter(activeFilter === label ? null : label);
                                        setFilterOpen(false);
                                    }}
                                    className={clsx(
                                        'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--muted)]',
                                        activeFilter === label
                                            ? 'font-semibold text-[var(--foreground)]'
                                            : 'text-[var(--foreground)]'
                                    )}
                                >
                                    {label}
                                    <span className="flex-none text-[10px] text-[var(--muted-foreground)]">
                                        {hint}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}

                    <button
                        onClick={() => onAddTask(column.id)}
                        className="rounded-md p-1 text-[var(--muted-foreground)] hover:bg-[var(--background)] hover:text-[var(--foreground)] transition-colors"
                        aria-label={`Add task to ${column.title}`}
                    >
                        <PlusIcon />
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
                            <CloseIcon />
                        </button>
                    )}
                </div>
            </div>

            {activeFilter && (
                <div className="flex items-center gap-2 border-y border-[var(--border)] bg-[var(--accent)]/15 px-3 py-1.5">
                    <span className="truncate text-[11px] uppercase tracking-[0.08em] text-[var(--foreground)]">
                        {activeFilter}
                    </span>
                    <button
                        type="button"
                        onClick={() => setActiveFilter(null)}
                        className="ml-auto flex-none text-[11px] uppercase tracking-[0.08em] underline transition-colors hover:text-[var(--accent)]"
                    >
                        Clear
                    </button>
                </div>
            )}

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
                            onToggleStatus={onToggleStatus}
                            onUpdateTask={onUpdateTask}
                            assignees={assignees}
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
