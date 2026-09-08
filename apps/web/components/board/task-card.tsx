'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { clsx } from 'clsx';
import { Avatar, priorityConfig, PRIORITIES } from '@/components/ui-shared';
import {
    CommentIcon,
    CheckCircleIcon,
    ArchiveIcon,
    ChevronDownIcon,
    MoreHorizontalIcon,
} from '@/components/icons';
import type { Task, Priority, UpdateTaskRequest, AssignableMember } from '@/lib/types';

type OpenMenu = 'priority' | 'assignee' | 'actions' | null;

/** First name, or the part of the address before the @ — the chip is narrow. */
function shortName(name: string | null | undefined, email: string): string {
    if (name?.trim()) return name.trim().split(/\s+/)[0]!;
    return email.split('@')[0]!;
}

interface TaskCardProps {
    task: Task;
    onClick: () => void;
    onToggleStatus?: (task: Task) => void;
    /** Applies a change made from one of the card's own chips. */
    onUpdateTask?: (task: Task, data: UpdateTaskRequest) => void;
    /** Roster for the assignee menu. Fetched once by the page, not per card. */
    assignees?: AssignableMember[];
    isDragOverlay?: boolean;
}

/**
 * The card is a drag handle *and* a button that opens the task, so every
 * control inside it has to claim both gestures before they reach the card.
 */
function stopBoth(e: React.SyntheticEvent) {
    e.stopPropagation();
}

/** A chip in the card's top row, optionally opening a menu beneath itself. */
function Chip({
    label,
    onOpen,
    open,
    className,
    children,
    menu,
}: {
    label: string;
    onOpen: () => void;
    open: boolean;
    className?: string;
    children: ReactNode;
    menu?: ReactNode;
}) {
    return (
        <div className="relative flex-none">
            <button
                type="button"
                aria-label={label}
                aria-expanded={open}
                aria-haspopup="menu"
                onPointerDown={stopBoth}
                onClick={(e) => {
                    stopBoth(e);
                    onOpen();
                }}
                className={clsx(
                    'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold transition-opacity hover:opacity-80',
                    className
                )}
            >
                {children}
                <ChevronDownIcon className="h-3 w-3 flex-none" />
            </button>
            {open && menu}
        </div>
    );
}

/** Shared popover shell, so both menus sit and scroll the same way. */
function Menu({ title, children }: { title: string; children: ReactNode }) {
    return (
        <div
            role="menu"
            aria-label={title}
            onPointerDown={stopBoth}
            onClick={stopBoth}
            className="absolute left-0 top-full z-20 mt-1 max-h-52 w-44 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg"
        >
            <div className="px-3 py-1 text-[10px] uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
                {title}
            </div>
            {children}
        </div>
    );
}

function MenuItem({
    onSelect,
    active,
    children,
}: {
    onSelect: () => void;
    active?: boolean;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            role="menuitemradio"
            aria-checked={!!active}
            onPointerDown={stopBoth}
            onClick={(e) => {
                stopBoth(e);
                onSelect();
            }}
            className={clsx(
                'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--muted)]',
                active ? 'font-semibold text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'
            )}
        >
            <span className="min-w-0 flex-1 truncate">{children}</span>
            {active && <CheckCircleIcon className="h-3.5 w-3.5 flex-none text-[var(--accent)]" />}
        </button>
    );
}

export function TaskCard({
    task,
    onClick,
    onToggleStatus,
    onUpdateTask,
    assignees,
    isDragOverlay,
}: TaskCardProps) {
    const [menu, setMenu] = useState<OpenMenu>(null);
    const [expanded, setExpanded] = useState(false);
    const [clipped, setClipped] = useState(false);
    const descriptionRef = useRef<HTMLParagraphElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);

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

    // The expand control earns its place only on a card whose text is actually
    // cut off, so measure the clamped paragraph rather than guessing by length.
    useLayoutEffect(() => {
        const el = descriptionRef.current;
        if (!el || expanded) return;
        setClipped(el.scrollHeight > el.clientHeight + 1);
    }, [task.description, expanded]);

    // Any menu closes on Escape or on a press anywhere else.
    useEffect(() => {
        if (!menu) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setMenu(null);
        };
        const onDown = (e: PointerEvent) => {
            if (!cardRef.current?.contains(e.target as Node)) setMenu(null);
        };
        document.addEventListener('keydown', onKey);
        document.addEventListener('pointerdown', onDown);
        return () => {
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('pointerdown', onDown);
        };
    }, [menu]);

    const priority = priorityConfig[task.priority];
    const assignee = task.assignee;
    const people = assignees ?? [];

    const apply = (data: UpdateTaskRequest) => {
        setMenu(null);
        onUpdateTask?.(task, data);
    };

    return (
        <div
            ref={(node) => {
                setNodeRef(node);
                cardRef.current = node;
            }}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            {...attributes}
            {...listeners}
            className={clsx(
                'group relative cursor-grab overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-sm transition-all hover:border-[var(--accent)] hover:shadow-md',
                task.status !== 'INCOMPLETED' && 'opacity-60',
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
            {/* Priority reads down the whole column without reading a word. */}
            <span
                aria-hidden="true"
                className={clsx('absolute inset-y-0 left-0 w-1.5', priority.spine)}
            />

            <div className="pl-1.5">
                {/* Properties, each on its own chip */}
                <div className="flex items-center gap-1.5 border-b border-[var(--border)] px-2.5 py-1.5">
                    {task.status === 'ARCHIVED' ? (
                        // Archiving is undone from the modal, so here the glyph is
                        // an indicator rather than a control.
                        <ArchiveIcon
                            className="h-4 w-4 flex-none text-[var(--muted-foreground)]"
                            aria-hidden={undefined}
                            aria-label="Archived"
                            role="img"
                        />
                    ) : (
                        <button
                            type="button"
                            aria-label={
                                task.status === 'COMPLETED'
                                    ? 'Mark as incompleted'
                                    : 'Mark as completed'
                            }
                            aria-pressed={task.status === 'COMPLETED'}
                            onPointerDown={stopBoth}
                            onClick={(e) => {
                                stopBoth(e);
                                onToggleStatus?.(task);
                            }}
                            className={clsx(
                                'grid h-4 w-4 flex-none place-items-center rounded-[3px] border transition-colors',
                                task.status === 'COMPLETED'
                                    ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]'
                                    : 'border-[var(--muted-foreground)] text-transparent hover:border-[var(--accent)]'
                            )}
                        >
                            <CheckCircleIcon className="h-3 w-3" />
                        </button>
                    )}

                    <Chip
                        label={`Priority: ${priority.label}`}
                        open={menu === 'priority'}
                        onOpen={() => setMenu(menu === 'priority' ? null : 'priority')}
                        className={clsx(
                            'uppercase tracking-[0.06em]',
                            priority.bgColor,
                            priority.color
                        )}
                        menu={
                            <Menu title="Priority">
                                {PRIORITIES.map((value) => (
                                    <MenuItem
                                        key={value}
                                        active={task.priority === value}
                                        onSelect={() => apply({ priority: value as Priority })}
                                    >
                                        {priorityConfig[value].label}
                                    </MenuItem>
                                ))}
                            </Menu>
                        }
                    >
                        {priority.label}
                    </Chip>

                    <div className="ml-auto flex min-w-0 items-center gap-1">
                        <Chip
                            label={
                                assignee
                                    ? `Assignee: ${assignee.name || assignee.email}`
                                    : 'Assign someone'
                            }
                            open={menu === 'assignee'}
                            onOpen={() => setMenu(menu === 'assignee' ? null : 'assignee')}
                            className="min-w-0 text-[var(--muted-foreground)]"
                            menu={
                                <Menu title="Assignee">
                                    <MenuItem
                                        active={!task.assigneeId}
                                        onSelect={() => apply({ assigneeId: null })}
                                    >
                                        Unassigned
                                    </MenuItem>
                                    {people.map((person) => (
                                        <MenuItem
                                            key={person.userId}
                                            active={task.assigneeId === person.userId}
                                            onSelect={() => apply({ assigneeId: person.userId })}
                                        >
                                            {person.name || person.email}
                                        </MenuItem>
                                    ))}
                                </Menu>
                            }
                        >
                            {assignee ? (
                                <>
                                    <Avatar
                                        src={assignee.image}
                                        name={assignee.name}
                                        size="sm"
                                    />
                                    <span className="truncate text-xs font-normal">
                                        {shortName(assignee.name, assignee.email)}
                                    </span>
                                </>
                            ) : (
                                <span className="text-xs font-normal">Unassigned</span>
                            )}
                        </Chip>

                        <div className="relative flex-none">
                            <button
                                type="button"
                                aria-label="Task actions"
                                aria-expanded={menu === 'actions'}
                                aria-haspopup="menu"
                                onPointerDown={stopBoth}
                                onClick={(e) => {
                                    stopBoth(e);
                                    setMenu(menu === 'actions' ? null : 'actions');
                                }}
                                className="grid h-5 w-5 place-items-center rounded text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                            >
                                <MoreHorizontalIcon className="h-3.5 w-3.5" />
                            </button>
                            {menu === 'actions' && (
                                <div
                                    role="menu"
                                    aria-label="Task actions"
                                    onPointerDown={stopBoth}
                                    onClick={stopBoth}
                                    className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg"
                                >
                                    <button
                                        type="button"
                                        role="menuitem"
                                        onPointerDown={stopBoth}
                                        onClick={(e) => {
                                            stopBoth(e);
                                            apply({
                                                status:
                                                    task.status === 'ARCHIVED'
                                                        ? 'INCOMPLETED'
                                                        : 'ARCHIVED',
                                            });
                                        }}
                                        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
                                    >
                                        <ArchiveIcon className="h-3.5 w-3.5 flex-none" />
                                        {task.status === 'ARCHIVED'
                                            ? 'Restore task'
                                            : 'Archive task'}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Title and description */}
                <div className="px-2.5 py-2">
                    <h4
                        className={clsx(
                            'text-sm font-medium leading-snug text-[var(--foreground)]',
                            task.status === 'COMPLETED' && 'line-through'
                        )}
                    >
                        {task.title}
                    </h4>

                    {task.description && (
                        <p
                            ref={descriptionRef}
                            className={clsx(
                                'mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]',
                                !expanded && 'line-clamp-2'
                            )}
                        >
                            {task.description}
                        </p>
                    )}
                </div>

                {(task._count?.comments || clipped || expanded) && (
                    <div className="flex items-center gap-3 border-t border-[var(--border)] px-2.5 py-1.5">
                        {task._count?.comments ? (
                            <span className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                                <CommentIcon className="h-3.5 w-3.5" />
                                {task._count.comments}
                            </span>
                        ) : null}

                        {(clipped || expanded) && (
                            <button
                                type="button"
                                aria-expanded={expanded}
                                onPointerDown={stopBoth}
                                onClick={(e) => {
                                    stopBoth(e);
                                    setExpanded(!expanded);
                                }}
                                className="ml-auto flex items-center gap-1 text-[10px] uppercase tracking-[0.08em] text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                            >
                                {expanded ? 'Less' : 'More'}
                                <ChevronDownIcon
                                    className={clsx(
                                        'h-3 w-3 transition-transform',
                                        expanded && 'rotate-180'
                                    )}
                                />
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

/** Lightweight version for drag overlay */
export function TaskCardOverlay({ task }: { task: Task }) {
    return <TaskCard task={task} onClick={() => { }} isDragOverlay />;
}
