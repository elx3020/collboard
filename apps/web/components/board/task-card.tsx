"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { clsx } from "clsx";
import { Avatar, priorityConfig, PRIORITIES } from "@/components/ui-shared";
import {
  CommentIcon,
  CheckCircleIcon,
  ArchiveIcon,
  ChevronDownIcon,
  MoreHorizontalIcon,
} from "@/components/icons";
import type {
  Task,
  Priority,
  UpdateTaskRequest,
  AssignableMember,
} from "@/lib/types";

type OpenMenu = "priority" | "assignee" | "actions" | null;

/** First name, or the part of the address before the @ — the chip is narrow. */
function shortName(name: string | null | undefined, email: string): string {
  if (name?.trim()) return name.trim().split(/\s+/)[0]!;
  return email.split("@")[0]!;
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
  menu?: (anchor: RefObject<HTMLButtonElement | null>) => ReactNode;
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <div className="relative min-w-0 flex-none">
      <button
        ref={anchor}
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
          "flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold transition-opacity hover:opacity-80",
          className,
        )}
      >
        {children}
        <ChevronDownIcon className="h-3 w-3 flex-none" />
      </button>
      {open && menu?.(anchor)}
    </div>
  );
}

/**
 * Menus render into the body rather than inside the card.
 *
 * The column's task list scrolls, and a scroll container clips both axes — CSS
 * forces `overflow-x` to `auto` once `overflow-y` is not `visible` — so a menu
 * anchored inside it is cut off near the column's edges. Positioned `fixed`
 * from the trigger's rect, nothing can clip it, and it flips above the trigger
 * when there is no room below.
 */
function Popover({
  anchor,
  align = "left",
  surface,
  children,
}: {
  anchor: RefObject<HTMLElement | null>;
  align?: "left" | "right";
  /** Set to the popover element, so the outside-press check can spare it. */
  surface: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Hidden for the first paint only: the flip decision needs a real height.
  const [style, setStyle] = useState<CSSProperties>({
    position: "fixed",
    top: 0,
    left: 0,
    visibility: "hidden",
  });

  useLayoutEffect(() => {
    const place = () => {
      const trigger = anchor.current;
      const el = ref.current;
      if (!trigger || !el) return;

      const r = trigger.getBoundingClientRect();
      const { offsetHeight: h, offsetWidth: w } = el;
      const below = r.bottom + 4;
      const top =
        below + h > window.innerHeight - 8 ? Math.max(8, r.top - 4 - h) : below;
      const wanted = align === "right" ? r.right - w : r.left;
      const left = Math.min(Math.max(8, wanted), window.innerWidth - w - 8);

      setStyle({ position: "fixed", top, left, visibility: "visible" });
    };

    place();
    // Capture, so scrolling the column itself keeps the menu on its trigger.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor, align]);

  return createPortal(
    <div
      ref={(node) => {
        ref.current = node;
        surface.current = node;
      }}
      style={style}
      // Portalled nodes still bubble through the React tree, so the card's
      // own click and drag handlers are reachable from here.
      onPointerDown={stopBoth}
      onClick={stopBoth}
      className="z-50 max-h-56 w-44 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg"
    >
      {children}
    </div>,
    document.body,
  );
}

/** Shared popover shell, so every menu sits and scrolls the same way. */
function Menu({
  title,
  anchor,
  surface,
  align,
  children,
}: {
  title: string;
  anchor: RefObject<HTMLElement | null>;
  surface: RefObject<HTMLDivElement | null>;
  align?: "left" | "right";
  children: ReactNode;
}) {
  return (
    <Popover anchor={anchor} align={align} surface={surface}>
      <div role="menu" aria-label={title}>
        <div className="px-3 py-1 text-[10px] uppercase tracking-[0.1em] text-[var(--muted-foreground)]">
          {title}
        </div>
        {children}
      </div>
    </Popover>
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
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-[var(--muted)]",
        active
          ? "font-semibold text-[var(--foreground)]"
          : "text-[var(--muted-foreground)]",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {active && (
        <CheckCircleIcon className="h-3.5 w-3.5 flex-none text-[var(--accent)]" />
      )}
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
  const surfaceRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLButtonElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: "task", task },
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
      if (e.key === "Escape") setMenu(null);
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      // The menu lives in a portal, so it is outside the card in the DOM.
      if (
        cardRef.current?.contains(target) ||
        surfaceRef.current?.contains(target)
      )
        return;
      setMenu(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
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
        "group relative cursor-grab rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-sm transition-all hover:border-[var(--accent)] hover:shadow-md",
        task.status !== "INCOMPLETED" && "opacity-60",
        isDragging && "opacity-40",
        isDragOverlay && "drag-overlay cursor-grabbing",
      )}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
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
        className={clsx(
          "absolute inset-y-0 left-0 w-1.5 rounded-l-[7px]",
          priority.spine,
        )}
      />

      <div className="pl-2.5">
        {/* Properties, each on its own chip */}
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
          {task.status === "ARCHIVED" ? (
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
                task.status === "COMPLETED"
                  ? "Mark as incompleted"
                  : "Mark as completed"
              }
              aria-pressed={task.status === "COMPLETED"}
              onPointerDown={stopBoth}
              onClick={(e) => {
                stopBoth(e);
                onToggleStatus?.(task);
              }}
              className={clsx(
                "grid h-4 w-4 flex-none place-items-center rounded-[3px] border transition-colors",
                task.status === "COMPLETED"
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
                  : "border-[var(--muted-foreground)] text-transparent hover:border-[var(--accent)]",
              )}
            >
              <CheckCircleIcon className="h-3 w-3" />
            </button>
          )}

          <Chip
            label={`Priority: ${priority.label}`}
            open={menu === "priority"}
            onOpen={() => setMenu(menu === "priority" ? null : "priority")}
            className={clsx(
              "uppercase tracking-[0.06em]",
              priority.bgColor,
              priority.color,
            )}
            menu={(anchor) => (
              <Menu title="Priority" anchor={anchor} surface={surfaceRef}>
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
            )}
          >
            {priority.label}
          </Chip>

          <div className="ml-auto flex min-w-0 items-center gap-1">
            <Chip
              label={
                assignee
                  ? `Assignee: ${assignee.name || assignee.email}`
                  : "Assign someone"
              }
              open={menu === "assignee"}
              onOpen={() => setMenu(menu === "assignee" ? null : "assignee")}
              className="min-w-0 text-[var(--muted-foreground)]"
              menu={(anchor) => (
                <Menu title="Assignee" anchor={anchor} surface={surfaceRef}>
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
              )}
            >
              {assignee ? (
                <>
                  <Avatar src={assignee.image} name={assignee.name} size="sm" />
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
                ref={actionsRef}
                type="button"
                aria-label="Task actions"
                aria-expanded={menu === "actions"}
                aria-haspopup="menu"
                onPointerDown={stopBoth}
                onClick={(e) => {
                  stopBoth(e);
                  setMenu(menu === "actions" ? null : "actions");
                }}
                className="grid h-5 w-5 place-items-center rounded text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              >
                <MoreHorizontalIcon className="h-3.5 w-3.5" />
              </button>
              {menu === "actions" && (
                <Popover anchor={actionsRef} align="right" surface={surfaceRef}>
                  <div role="menu" aria-label="Task actions">
                    <button
                      type="button"
                      role="menuitem"
                      onPointerDown={stopBoth}
                      onClick={(e) => {
                        stopBoth(e);
                        apply({
                          status:
                            task.status === "ARCHIVED"
                              ? "INCOMPLETED"
                              : "ARCHIVED",
                        });
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
                    >
                      <ArchiveIcon className="h-3.5 w-3.5 flex-none" />
                      {task.status === "ARCHIVED"
                        ? "Restore task"
                        : "Archive task"}
                    </button>
                  </div>
                </Popover>
              )}
            </div>
          </div>
        </div>

        {/* Title and description */}
        <div className="px-3 py-2.5">
          <h4
            className={clsx(
              "text-sm font-medium leading-snug text-[var(--foreground)]",
              task.status === "COMPLETED" && "line-through",
            )}
          >
            {task.title}
          </h4>

          {task.description && (
            <p
              ref={descriptionRef}
              className={clsx(
                "mt-1.5 text-xs leading-relaxed text-[var(--muted-foreground)]",
                !expanded && "line-clamp-2",
              )}
            >
              {task.description}
            </p>
          )}
        </div>

        {(task._count?.comments || clipped || expanded) && (
          <div className="flex items-center gap-3 border-t border-[var(--border)] px-3 py-2">
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
                {expanded ? "Less" : "More"}
                <ChevronDownIcon
                  className={clsx(
                    "h-3 w-3 transition-transform",
                    expanded && "rotate-180",
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
  return <TaskCard task={task} onClick={() => {}} isDragOverlay />;
}
