# Dashboard Board Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the dashboard's inline board markup into reusable components, split boards into owned / shared-by-me / shared-with-me sections, and add per-board rename, description, member management, and background colour.

**Architecture:** Presentational components (`BoardCard`, `BoardSection`) take props and emit callbacks; a pure `groupBoards()` function does the partitioning and is unit-tested without a DOM. All editing lives in a `BoardSettingsModal` opened from a `⋯` button on the card, keeping the card itself a plain navigation link. Three of the four features use API endpoints that already exist; only the colour needs a schema migration.

**Tech Stack:** Next.js 15 App Router, React 19, TanStack Query, Tailwind v4 with CSS-variable tokens, Prisma 7 + Postgres, Vitest (node + happy-dom), Playwright.

**Spec:** None — the user explicitly chose to skip the spec document. The agreed design is reproduced in "Design Summary" below; that section is the spec for this plan's purposes.

## Design Summary

Decisions taken during brainstorming, all confirmed by the user:

1. **Scope:** spec everything, implement in stages. Each task below is independently reviewable; stopping after any task leaves working software.
2. **Grouping is a partition** — every board appears exactly once:
   - `owned` — I own it and it has no other members (private)
   - `sharedByMe` — I own it and it has one or more members
   - `sharedWithMe` — someone else owns it
3. **Affordances:** the card stays a navigation `<Link>` showing read-only information. A `⋯` button opens `BoardSettingsModal`, which holds rename, description, colour picker, and the member panel. Rationale: nesting inputs and buttons inside an anchor creates nested-interactive-element problems for keyboard and screen-reader users.
4. **Colour is a curated palette token** (`"amber" | "sky" | ...`), not free-form hex. Each token maps to a pre-validated light AND dark value in `globals.css`, so a coloured card is readable in both themes by construction. Free hex cannot do this — one value cannot serve two grounds.

## Global Constraints

- Lint is `--max-warnings 0` and `eslint-plugin-only-warn` downgrades errors to warnings, so **any** lint finding fails the build.
- Prisma Client must be generated before lint / type-check / build will pass: `npx prisma generate`.
- Server-side logging goes through `lib/logger.ts` (pino), never `console`.
- `@/*` maps to `apps/web/*`.
- Vitest defaults to the `node` environment; component tests opt in with `// @vitest-environment happy-dom` on **line 1**.
- Integration tests mock `@/lib/prisma` and `next-auth/next` rather than hitting a database.
- All colours must come from CSS variables (`var(--foreground)`, `var(--card)`, …). Never hardcode a hex or a Tailwind palette colour in a component — a session-earlier bug came from exactly that.
- Indentation in `apps/web` is 4 spaces in `components/` and `app/` `.tsx` files, 2 spaces in `lib/` and `tests/`. Match the file you are editing.
- Every task runs from `/home/elx3020/collboard/apps/web` unless stated otherwise.

## Pre-existing bug this plan fixes

`GET /api/boards` returns `_count: { columns, members }`, but:

- `lib/types.ts` types it as `_count?: { columns: number }` — `members` is missing.
- `app/dashboard/page.tsx:173` renders `board.members?.length ?? 0` as the member count, but that route deliberately fetches only the current user's membership row (`members: { where: { userId }, take: 1 }`).

So the dashboard currently shows "0 members" or "1 members" for every board regardless of reality. Task 1 fixes the type; Task 2 switches the card to `_count.members`. The grouping in Task 1 depends on this being correct.

## File Structure

**Create:**
- `lib/boards/group-boards.ts` — pure partition function. No React, no imports from `lib/api`.
- `lib/boards/board-colors.ts` — palette token list, type, and validator. Imported by **both** client components and the server route, so it must not carry `'use client'` and must not import anything client-only.
- `components/dashboard/board-card.tsx` — presentational card.
- `components/dashboard/board-section.tsx` — section heading + grid.
- `components/dashboard/board-settings-modal.tsx` — rename, description, colour, members.
- `tests/unit/group-boards.test.ts` — node env.
- `tests/components/board-card.test.tsx` — happy-dom env.

**Modify:**
- `lib/types.ts` — `Board._count.members`, `Board.color`, `UpdateBoardRequest.color`.
- `app/dashboard/page.tsx` — compose sections; drops from ~197 lines to ~80.
- `app/api/boards/[boardId]/route.ts` — accept and validate `color` in PATCH.
- `prisma/schema.prisma` — `Board.color String?`.
- `app/globals.css` — board colour tokens.
- `tests/integration/api-routes.test.ts` — PATCH colour validation tests.

`components/dashboard/` is deliberately separate from the existing `components/board/`, which holds kanban internals (columns, task detail modal). Mixing dashboard cards into that folder would be confusing.

---

### Task 1: Board grouping function

**Files:**
- Create: `lib/boards/group-boards.ts`
- Create: `tests/unit/group-boards.test.ts`
- Modify: `lib/types.ts:126` (add `members` to `_count`)

**Interfaces:**
- Consumes: `Board` from `@/lib/types`.
- Produces: `groupBoards(boards: Board[], currentUserId: string): GroupedBoards` where `GroupedBoards = { owned: Board[]; sharedByMe: Board[]; sharedWithMe: Board[] }`. Also exports `type BoardGroupKey = 'owned' | 'sharedByMe' | 'sharedWithMe'`. Tasks 3 and 4 rely on these exact names.

- [ ] **Step 1: Fix the `_count` type**

In `lib/types.ts`, change line 126 from `_count?: { columns: number };` to:

```ts
  _count?: { columns: number; members: number };
```

- [ ] **Step 2: Write the failing test**

Create `tests/unit/group-boards.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { groupBoards } from '@/lib/boards/group-boards';
import type { Board } from '@/lib/types';

const ME = 'user-me';
const OTHER = 'user-other';

/** Builds a Board with only the fields the grouping cares about. */
function makeBoard(
  id: string,
  ownerId: string,
  memberCount: number
): Board {
  return {
    id,
    title: `Board ${id}`,
    description: null,
    ownerId,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    owner: { id: ownerId, name: null, email: 'owner@example.com', image: null },
    members: [],
    columns: [],
    _count: { columns: 0, members: memberCount },
  };
}

describe('groupBoards', () => {
  it('puts a board I own with no members in "owned"', () => {
    const result = groupBoards([makeBoard('b1', ME, 0)], ME);

    expect(result.owned.map((b) => b.id)).toEqual(['b1']);
    expect(result.sharedByMe).toEqual([]);
    expect(result.sharedWithMe).toEqual([]);
  });

  it('puts a board I own that has members in "sharedByMe"', () => {
    const result = groupBoards([makeBoard('b2', ME, 3)], ME);

    expect(result.sharedByMe.map((b) => b.id)).toEqual(['b2']);
    expect(result.owned).toEqual([]);
  });

  it('puts a board someone else owns in "sharedWithMe"', () => {
    const result = groupBoards([makeBoard('b3', OTHER, 2)], ME);

    expect(result.sharedWithMe.map((b) => b.id)).toEqual(['b3']);
    expect(result.owned).toEqual([]);
    expect(result.sharedByMe).toEqual([]);
  });

  it('never places one board in two groups', () => {
    const boards = [
      makeBoard('b1', ME, 0),
      makeBoard('b2', ME, 3),
      makeBoard('b3', OTHER, 2),
      makeBoard('b4', OTHER, 0),
    ];

    const result = groupBoards(boards, ME);
    const all = [...result.owned, ...result.sharedByMe, ...result.sharedWithMe];

    expect(all).toHaveLength(4);
    expect(new Set(all.map((b) => b.id)).size).toBe(4);
  });

  it('treats a missing _count as zero members', () => {
    const board = makeBoard('b5', ME, 0);
    delete board._count;

    const result = groupBoards([board], ME);

    expect(result.owned.map((b) => b.id)).toEqual(['b5']);
  });

  it('preserves the input order within each group', () => {
    const boards = [
      makeBoard('first', ME, 0),
      makeBoard('second', ME, 0),
      makeBoard('third', ME, 0),
    ];

    const result = groupBoards(boards, ME);

    expect(result.owned.map((b) => b.id)).toEqual(['first', 'second', 'third']);
  });

  it('returns three empty groups for an empty list', () => {
    const result = groupBoards([], ME);

    expect(result).toEqual({ owned: [], sharedByMe: [], sharedWithMe: [] });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
npx vitest run tests/unit/group-boards.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/boards/group-boards"`.

- [ ] **Step 4: Write the implementation**

Create `lib/boards/group-boards.ts`:

```ts
import type { Board } from '@/lib/types';

export type BoardGroupKey = 'owned' | 'sharedByMe' | 'sharedWithMe';

export interface GroupedBoards {
  owned: Board[];
  sharedByMe: Board[];
  sharedWithMe: Board[];
}

/**
 * Partition boards into three disjoint groups. Every board lands in exactly
 * one group.
 *
 * Board owners have no BoardMember row (they are implicitly OWNER), so
 * `_count.members` is already the non-owner member count.
 */
export function groupBoards(
  boards: Board[],
  currentUserId: string
): GroupedBoards {
  const grouped: GroupedBoards = {
    owned: [],
    sharedByMe: [],
    sharedWithMe: [],
  };

  for (const board of boards) {
    if (board.ownerId !== currentUserId) {
      grouped.sharedWithMe.push(board);
    } else if ((board._count?.members ?? 0) > 0) {
      grouped.sharedByMe.push(board);
    } else {
      grouped.owned.push(board);
    }
  }

  return grouped;
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
npx vitest run tests/unit/group-boards.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 6: Type-check and lint**

```bash
npx tsc --noEmit -p tsconfig.json
npx eslint --max-warnings 0 lib/boards tests/unit/group-boards.test.ts
```

Expected: both silent.

- [ ] **Step 7: Commit**

```bash
git add lib/boards/group-boards.ts tests/unit/group-boards.test.ts lib/types.ts
git commit -m "feat: add groupBoards partition helper and fix Board._count type"
```

---

### Task 2: BoardCard component

**Files:**
- Create: `components/dashboard/board-card.tsx`
- Create: `tests/components/board-card.test.tsx`

**Interfaces:**
- Consumes: `Board`, `Role` from `@/lib/types`.
- Produces: `<BoardCard board={board} onDelete={(id: string) => void} onOpenSettings={(board: Board) => void} />`. Both callbacks are required. Task 3 renders this; Task 4 supplies `onOpenSettings`.

The card is presentational: it holds no query hooks and performs no mutations. It renders a `⋯` settings button and a delete button only when `board.currentUserRole === 'OWNER'`.

- [ ] **Step 1: Write the failing test**

Create `tests/components/board-card.test.tsx` — note the environment comment must be line 1:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { Board } from '@/lib/types';

vi.mock('next/link', () => ({
    default: ({
        children,
        href,
        ...rest
    }: { children: React.ReactNode; href: string } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a href={href} {...rest}>
            {children}
        </a>
    ),
}));

function makeBoard(overrides: Partial<Board> = {}): Board {
    return {
        id: 'board-1',
        title: 'Q3 Roadmap',
        description: 'Ship the new onboarding',
        ownerId: 'user-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        owner: { id: 'user-1', name: 'Ada', email: 'ada@example.com', image: null },
        members: [],
        columns: [],
        currentUserRole: 'OWNER',
        _count: { columns: 4, members: 3 },
        ...overrides,
    };
}

describe('BoardCard', () => {
    it('renders title, description and counts', async () => {
        const { BoardCard } = await import('@/components/dashboard/board-card');

        render(
            <BoardCard board={makeBoard()} onDelete={vi.fn()} onOpenSettings={vi.fn()} />
        );

        expect(screen.getByText('Q3 Roadmap')).toBeInTheDocument();
        expect(screen.getByText('Ship the new onboarding')).toBeInTheDocument();
        expect(screen.getByText('4 columns')).toBeInTheDocument();
        expect(screen.getByText('3 members')).toBeInTheDocument();
    });

    it('links to the board', async () => {
        const { BoardCard } = await import('@/components/dashboard/board-card');

        render(
            <BoardCard board={makeBoard()} onDelete={vi.fn()} onOpenSettings={vi.fn()} />
        );

        expect(screen.getByRole('link', { name: /Q3 Roadmap/ })).toHaveAttribute(
            'href',
            '/boards/board-1'
        );
    });

    it('uses _count.members, not the members array', async () => {
        const { BoardCard } = await import('@/components/dashboard/board-card');

        // The API caps the members array at the current user's own row,
        // so the array length is never the real member count.
        render(
            <BoardCard
                board={makeBoard({ members: [], _count: { columns: 1, members: 7 } })}
                onDelete={vi.fn()}
                onOpenSettings={vi.fn()}
            />
        );

        expect(screen.getByText('7 members')).toBeInTheDocument();
    });

    it('calls onOpenSettings without navigating', async () => {
        const { BoardCard } = await import('@/components/dashboard/board-card');
        const onOpenSettings = vi.fn();
        const board = makeBoard();

        render(
            <BoardCard board={board} onDelete={vi.fn()} onOpenSettings={onOpenSettings} />
        );
        fireEvent.click(screen.getByLabelText('Board settings'));

        expect(onOpenSettings).toHaveBeenCalledWith(board);
    });

    it('calls onDelete with the board id', async () => {
        const { BoardCard } = await import('@/components/dashboard/board-card');
        const onDelete = vi.fn();

        render(
            <BoardCard board={makeBoard()} onDelete={onDelete} onOpenSettings={vi.fn()} />
        );
        fireEvent.click(screen.getByLabelText('Delete board'));

        expect(onDelete).toHaveBeenCalledWith('board-1');
    });

    it('hides settings and delete for non-owners', async () => {
        const { BoardCard } = await import('@/components/dashboard/board-card');

        render(
            <BoardCard
                board={makeBoard({ currentUserRole: 'VIEWER' })}
                onDelete={vi.fn()}
                onOpenSettings={vi.fn()}
            />
        );

        expect(screen.queryByLabelText('Board settings')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('Delete board')).not.toBeInTheDocument();
    });

    it('omits the description paragraph when there is none', async () => {
        const { BoardCard } = await import('@/components/dashboard/board-card');

        render(
            <BoardCard
                board={makeBoard({ description: null })}
                onDelete={vi.fn()}
                onOpenSettings={vi.fn()}
            />
        );

        expect(screen.queryByText('Ship the new onboarding')).not.toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/components/board-card.test.tsx
```

Expected: FAIL — cannot resolve `@/components/dashboard/board-card`.

- [ ] **Step 3: Write the implementation**

Create `components/dashboard/board-card.tsx`. The `⋯` and delete buttons sit inside the `<Link>`, so both handlers must call `preventDefault()` and `stopPropagation()` to suppress navigation:

```tsx
'use client';

import Link from 'next/link';
import type { Board } from '@/lib/types';

function ColumnsIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
        >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
    );
}

function MembersIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
        >
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    );
}

export function BoardCard({
    board,
    onDelete,
    onOpenSettings,
}: {
    board: Board;
    onDelete: (boardId: string) => void;
    onOpenSettings: (board: Board) => void;
}) {
    const isOwner = board.currentUserRole === 'OWNER';

    return (
        <Link
            href={`/boards/${board.id}`}
            className="group relative rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm transition-all hover:border-[var(--accent)] hover:shadow-md"
        >
            {isOwner && (
                <div className="absolute right-3 top-3 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onOpenSettings(board);
                        }}
                        className="rounded-lg p-1.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                        aria-label="Board settings"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            aria-hidden="true"
                        >
                            <circle cx="5" cy="12" r="1.5" />
                            <circle cx="12" cy="12" r="1.5" />
                            <circle cx="19" cy="12" r="1.5" />
                        </svg>
                    </button>

                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onDelete(board.id);
                        }}
                        className="rounded-lg p-1.5 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--destructive)]/15 hover:text-[var(--destructive)]"
                        aria-label="Delete board"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            aria-hidden="true"
                        >
                            <polyline points="3,6 5,6 21,6" />
                            <path d="M19,6v14a2,2,0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2-2h4a2,2,0,0,1,2,2V6" />
                        </svg>
                    </button>
                </div>
            )}

            <h3 className="pr-16 text-lg font-semibold text-[var(--foreground)] transition-colors group-hover:text-[var(--accent)]">
                {board.title}
            </h3>

            {board.description && (
                <p className="mt-1 line-clamp-2 text-sm text-[var(--muted-foreground)]">
                    {board.description}
                </p>
            )}

            <div className="mt-4 flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                <span className="inline-flex items-center gap-1">
                    <ColumnsIcon />
                    {board._count?.columns ?? 0} columns
                </span>
                <span className="inline-flex items-center gap-1">
                    <MembersIcon />
                    {board._count?.members ?? 0} members
                </span>
                <span
                    className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs font-medium"
                    role="status"
                >
                    {board.currentUserRole}
                </span>
            </div>
        </Link>
    );
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/components/board-card.test.tsx
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Type-check and lint**

```bash
npx tsc --noEmit -p tsconfig.json
npx eslint --max-warnings 0 components/dashboard tests/components/board-card.test.tsx
```

Expected: both silent.

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/board-card.tsx tests/components/board-card.test.tsx
git commit -m "feat: extract BoardCard component with correct member count"
```

---

### Task 3: BoardSection and dashboard composition

**Files:**
- Create: `components/dashboard/board-section.tsx`
- Modify: `app/dashboard/page.tsx` (full rewrite of the render body)

**Interfaces:**
- Consumes: `BoardCard` (Task 2), `groupBoards` / `GroupedBoards` (Task 1).
- Produces: `<BoardSection title={string} boards={Board[]} emptyHint={string} onDelete={...} onOpenSettings={...} />`. Renders nothing at all when `boards` is empty — the dashboard's global empty state covers the "no boards anywhere" case.

At the end of this task `onOpenSettings` is a literal no-op (`() => {}`), because the modal does not exist yet — the `⋯` button renders but does nothing. Task 4 introduces the `settingsBoard` state and the modal together.

Do **not** add `const [settingsBoard, setSettingsBoard] = useState<Board | null>(null);` in this task: nothing reads the value until Task 4, and `@typescript-eslint/no-unused-vars` would fire on it. Lint runs at `--max-warnings 0`, so that fails the build. Verified empirically before execution.

- [ ] **Step 1: Write BoardSection**

Create `components/dashboard/board-section.tsx`:

```tsx
'use client';

import type { Board } from '@/lib/types';
import { BoardCard } from '@/components/dashboard/board-card';

export function BoardSection({
    title,
    boards,
    emptyHint,
    onDelete,
    onOpenSettings,
}: {
    title: string;
    boards: Board[];
    emptyHint: string;
    onDelete: (boardId: string) => void;
    onOpenSettings: (board: Board) => void;
}) {
    if (boards.length === 0) return null;

    return (
        <section className="mb-10" aria-label={title}>
            <div className="mb-3 flex items-baseline gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    {title}
                </h2>
                <span className="text-xs text-[var(--muted-foreground)]">
                    {boards.length}
                </span>
            </div>

            <p className="sr-only">{emptyHint}</p>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {boards.map((board) => (
                    <BoardCard
                        key={board.id}
                        board={board}
                        onDelete={onDelete}
                        onOpenSettings={onOpenSettings}
                    />
                ))}
            </div>
        </section>
    );
}
```

- [ ] **Step 2: Rewrite the dashboard page**

Replace the entire contents of `app/dashboard/page.tsx` with:

```tsx
'use client';

import { useState, lazy, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useBoards, useDeleteBoard } from '@/lib/hooks/use-queries';
import { Navbar } from '@/components/navbar';
import { Spinner, EmptyState } from '@/components/ui-shared';
import { BoardSection } from '@/components/dashboard/board-section';
import { groupBoards } from '@/lib/boards/group-boards';

// Lazy load the modal — only downloaded when user clicks "New Board"
const CreateBoardModal = lazy(() =>
    import('@/components/create-board-modal').then((m) => ({ default: m.CreateBoardModal }))
);

// Task 4 replaces this with real settings-modal state.
const NOOP_OPEN_SETTINGS = () => {};

function PlusIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
        >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
    );
}

function BoardsIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-12 w-12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
        >
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
    );
}

export default function DashboardPage() {
    const { data: session } = useSession();
    const { data: boards, isLoading, error } = useBoards();
    const deleteBoard = useDeleteBoard();
    const [createModalOpen, setCreateModalOpen] = useState(false);

    const currentUserId = session?.user?.id ?? '';
    const grouped = groupBoards(boards ?? [], currentUserId);

    const handleDelete = (boardId: string) => {
        if (confirm('Delete this board? This cannot be undone.')) {
            deleteBoard.mutate(boardId);
        }
    };

    return (
        <div className="min-h-screen bg-[var(--background)]">
            <Navbar />
            <main className="mx-auto max-w-screen-xl px-4 py-8 sm:px-6">
                <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold text-[var(--foreground)] sm:text-3xl">
                            My Boards
                        </h1>
                        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                            Manage your Kanban boards
                        </p>
                    </div>
                    <button
                        onClick={() => setCreateModalOpen(true)}
                        className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--accent-foreground)] transition-opacity hover:opacity-90"
                    >
                        <PlusIcon />
                        New Board
                    </button>
                </div>

                {isLoading && (
                    <div className="flex items-center justify-center py-20">
                        <Spinner size="lg" />
                    </div>
                )}

                {error && (
                    <div className="rounded-lg border border-[var(--destructive)] bg-[var(--destructive)]/10 p-4 text-sm text-[var(--foreground)]">
                        Failed to load boards: {error.message}
                    </div>
                )}

                {boards && boards.length === 0 && (
                    <EmptyState
                        icon={<BoardsIcon />}
                        title="No boards yet"
                        description="Create your first Kanban board to get started."
                        action={
                            <button
                                onClick={() => setCreateModalOpen(true)}
                                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-foreground)] transition-opacity hover:opacity-90"
                            >
                                Create Board
                            </button>
                        }
                    />
                )}

                {boards && boards.length > 0 && (
                    <>
                        <BoardSection
                            title="My boards"
                            boards={grouped.owned}
                            emptyHint="Boards you own that are not shared with anyone."
                            onDelete={handleDelete}
                            onOpenSettings={NOOP_OPEN_SETTINGS}
                        />
                        <BoardSection
                            title="Shared by me"
                            boards={grouped.sharedByMe}
                            emptyHint="Boards you own and have invited others to."
                            onDelete={handleDelete}
                            onOpenSettings={NOOP_OPEN_SETTINGS}
                        />
                        <BoardSection
                            title="Shared with me"
                            boards={grouped.sharedWithMe}
                            emptyHint="Boards owned by other people that you can access."
                            onDelete={handleDelete}
                            onOpenSettings={NOOP_OPEN_SETTINGS}
                        />
                    </>
                )}
            </main>

            <Suspense fallback={null}>
                <CreateBoardModal
                    open={createModalOpen}
                    onClose={() => setCreateModalOpen(false)}
                />
            </Suspense>
        </div>
    );
}
```

Note: `onOpenSettings` is intentionally inert in this task. The `⋯` button appears on owner-owned cards but does nothing until Task 4.

- [ ] **Step 3: Run all existing tests**

```bash
npx vitest run
```

Expected: PASS, 67 tests (60 existing + 7 from Task 1 — Task 2's 7 bring it to 74 if already merged).

- [ ] **Step 4: Type-check and lint**

```bash
npx tsc --noEmit -p tsconfig.json
npx eslint --max-warnings 0 app/dashboard components/dashboard
```

Expected: both silent.

- [ ] **Step 5: Verify in the browser**

Start the dev server if it is not already running (`npm run dev` from `apps/web`), then sign in and open `http://localhost:3000/dashboard`. Confirm:
- A board you own with no members appears under "My boards".
- After inviting someone, that board moves to "Shared by me".
- Sections with no boards render nothing at all (no empty headings).
- The member count on a card matches the real member count, not 0/1.

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/board-section.tsx app/dashboard/page.tsx
git commit -m "feat: split dashboard boards into owned/shared sections"
```

---

### Task 4: Board settings modal — rename and description

**Files:**
- Create: `components/dashboard/board-settings-modal.tsx`
- Modify: `app/dashboard/page.tsx` (render the modal)

**Interfaces:**
- Consumes: `Modal` from `@/components/modal` (props: `open`, `onClose`, `title`, `children`, `size?: 'sm' | 'md' | 'lg'`), `useUpdateBoard(boardId)` from `@/lib/hooks/use-queries` (mutation takes `UpdateBoardRequest`, shows its own success/error toast).
- Produces: `<BoardSettingsModal board={Board | null} onClose={() => void} />`. Renders nothing when `board` is null.

`useUpdateBoard` already invalidates both `queryKeys.board(boardId)` and `queryKeys.boards`, so the dashboard refreshes itself after a save. Do not add manual invalidation.

- [ ] **Step 1: Add `color` to `UpdateBoardRequest` now**

In `lib/types.ts`, replace the `UpdateBoardRequest` interface (line 182) with:

```ts
export interface UpdateBoardRequest {
  title?: string;
  description?: string;
  color?: string | null;
}
```

Doing this here rather than in Task 6 keeps the modal's mutation type stable across tasks.

- [ ] **Step 2: Write the modal**

Create `components/dashboard/board-settings-modal.tsx`:

```tsx
'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '@/components/modal';
import { useUpdateBoard } from '@/lib/hooks/use-queries';
import type { Board } from '@/lib/types';

const inputClass =
    'mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]';

export function BoardSettingsModal({
    board,
    onClose,
}: {
    board: Board | null;
    onClose: () => void;
}) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');

    // Re-seed the form whenever a different board is opened.
    useEffect(() => {
        if (board) {
            setTitle(board.title);
            setDescription(board.description ?? '');
        }
    }, [board]);

    const updateBoard = useUpdateBoard(board?.id ?? '');

    if (!board) return null;

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!title.trim()) return;

        updateBoard.mutate(
            { title: title.trim(), description: description.trim() },
            { onSuccess: onClose }
        );
    };

    return (
        <Modal open={!!board} onClose={onClose} title="Board Settings">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label
                        htmlFor="board-settings-title"
                        className="block text-sm font-medium text-[var(--foreground)]"
                    >
                        Name
                    </label>
                    <input
                        id="board-settings-title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        required
                        className={inputClass}
                    />
                </div>

                <div>
                    <label
                        htmlFor="board-settings-description"
                        className="block text-sm font-medium text-[var(--foreground)]"
                    >
                        Description
                    </label>
                    <textarea
                        id="board-settings-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        placeholder="What's this board for?"
                        className={`${inputClass} resize-none`}
                    />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={updateBoard.isPending || !title.trim()}
                        className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                        {updateBoard.isPending ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
```

- [ ] **Step 3: Render the modal from the dashboard**

In `app/dashboard/page.tsx`, add these imports beside the other component imports:

```tsx
import { BoardSettingsModal } from '@/components/dashboard/board-settings-modal';
import type { Board } from '@/lib/types';
```

Delete the `NOOP_OPEN_SETTINGS` placeholder added in Task 3:

```tsx
// Task 4 replaces this with real settings-modal state.
const NOOP_OPEN_SETTINGS = () => {};
```

Add the state beside `createModalOpen`:

```tsx
    const [settingsBoard, setSettingsBoard] = useState<Board | null>(null);
```

Replace all three `onOpenSettings={NOOP_OPEN_SETTINGS}` props with:

```tsx
                            onOpenSettings={setSettingsBoard}
```

Then, directly after the closing `</Suspense>` of `CreateBoardModal`, add:

```tsx
            <BoardSettingsModal
                board={settingsBoard}
                onClose={() => setSettingsBoard(null)}
            />
```

- [ ] **Step 4: Type-check, lint and test**

```bash
npx tsc --noEmit -p tsconfig.json
npx eslint --max-warnings 0 app/dashboard components/dashboard lib/types.ts
npx vitest run
```

Expected: all silent / passing.

- [ ] **Step 5: Verify in the browser**

On `/dashboard`, hover a board you own, click `⋯`, change the name and description, save. Confirm the card updates without a page reload, and that clearing the name disables the Save button.

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/board-settings-modal.tsx app/dashboard/page.tsx lib/types.ts
git commit -m "feat: add board settings modal with rename and description"
```

---

### Task 5: Member panel in the settings modal

**Files:**
- Modify: `components/dashboard/board-settings-modal.tsx`

**Interfaces:**
- Consumes: `useMembers(boardId)`, `useInviteMember(boardId)`, `useRemoveMember(boardId)` from `@/lib/hooks/use-queries`; `Avatar` from `@/components/ui-shared` (props: `src?`, `name?`, `size?: 'sm' | 'md' | 'lg'`); `BoardMember` from `@/lib/types` (`{ id, boardId, userId, role, user?: UserSummary, createdAt }`).
- Produces: nothing new for later tasks.

`useInviteMember` takes `InviteMemberRequest = { email: string; role?: 'EDITOR' | 'VIEWER' }`. The server returns 404 "User not found. They need to create an account first." when the email has no account; the hook's `onError` already toasts that message, so do not build a second error surface.

`useRemoveMember` takes the **member row id** (`member.id`), not the user id.

- [ ] **Step 1: Add the member panel**

In `components/dashboard/board-settings-modal.tsx`, extend the imports:

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '@/components/modal';
import { Avatar } from '@/components/ui-shared';
import {
    useUpdateBoard,
    useMembers,
    useInviteMember,
    useRemoveMember,
} from '@/lib/hooks/use-queries';
import type { Board } from '@/lib/types';
```

Add state beside the existing `title` / `description` state:

```tsx
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<'EDITOR' | 'VIEWER'>('VIEWER');
```

Add the hooks beside `useUpdateBoard`:

```tsx
    const boardId = board?.id ?? '';
    const { data: members } = useMembers(boardId);
    const inviteMember = useInviteMember(boardId);
    const removeMember = useRemoveMember(boardId);
```

Add the invite handler beside `handleSubmit`:

```tsx
    const handleInvite = (e: FormEvent) => {
        e.preventDefault();
        const email = inviteEmail.trim();
        if (!email) return;

        inviteMember.mutate(
            { email, role: inviteRole },
            { onSuccess: () => setInviteEmail('') }
        );
    };
```

Then insert this block inside the `<Modal>`, after the closing `</form>` of the settings form:

```tsx
                <div className="mt-6 border-t border-[var(--border)] pt-4">
                    <h3 className="text-sm font-medium text-[var(--foreground)]">Members</h3>

                    <div className="mt-2 flex gap-2">
                        <input
                            type="email"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            placeholder="teammate@example.com"
                            aria-label="Invite by email"
                            className={`${inputClass} mt-0 flex-1`}
                        />
                        <select
                            value={inviteRole}
                            onChange={(e) =>
                                setInviteRole(e.target.value as 'EDITOR' | 'VIEWER')
                            }
                            aria-label="Member role"
                            className="mt-0 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-2 text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none"
                        >
                            <option value="VIEWER">Viewer</option>
                            <option value="EDITOR">Editor</option>
                        </select>
                        <button
                            type="button"
                            onClick={handleInvite}
                            disabled={inviteMember.isPending || !inviteEmail.trim()}
                            className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-[var(--accent-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
                        >
                            {inviteMember.isPending ? 'Adding...' : 'Add'}
                        </button>
                    </div>

                    <ul className="mt-3 space-y-2">
                        {members?.map((member) => (
                            <li
                                key={member.id}
                                className="flex items-center justify-between gap-2"
                            >
                                <span className="flex min-w-0 items-center gap-2">
                                    <Avatar
                                        src={member.user?.image}
                                        name={member.user?.name || member.user?.email}
                                        size="sm"
                                    />
                                    <span className="truncate text-sm text-[var(--foreground)]">
                                        {member.user?.name || member.user?.email}
                                    </span>
                                </span>
                                <span className="flex shrink-0 items-center gap-2">
                                    <span className="text-xs text-[var(--muted-foreground)]">
                                        {member.role}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => removeMember.mutate(member.id)}
                                        className="rounded-lg p-1 text-[var(--muted-foreground)] transition-colors hover:text-[var(--destructive)]"
                                        aria-label={`Remove ${member.user?.email ?? 'member'}`}
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className="h-4 w-4"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth={2}
                                            aria-hidden="true"
                                        >
                                            <line x1="18" y1="6" x2="6" y2="18" />
                                            <line x1="6" y1="6" x2="18" y2="18" />
                                        </svg>
                                    </button>
                                </span>
                            </li>
                        ))}
                    </ul>

                    {members && members.length === 0 && (
                        <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                            No members yet. Add someone by email above.
                        </p>
                    )}
                </div>
```

The invite form is a `<button type="button">` with an onClick rather than a nested `<form>`, because it sits inside the settings `<form>` in the DOM order above it — nested forms are invalid HTML.

- [ ] **Step 2: Type-check, lint and test**

```bash
npx tsc --noEmit -p tsconfig.json
npx eslint --max-warnings 0 components/dashboard
npx vitest run
```

Expected: all silent / passing.

- [ ] **Step 3: Verify in the browser**

Open a board's settings. Add a member using an email that has an account — the list should update and a "Member invited" toast appears. Add an email with no account — expect a "User not found" toast and no list change. Remove a member with the `×`. Then close the modal and confirm the board has moved from "My boards" to "Shared by me", and the member count on the card increased.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/board-settings-modal.tsx
git commit -m "feat: manage board members from the settings modal"
```

---

### Task 6: Board colour — schema, types and server validation

**Files:**
- Create: `lib/boards/board-colors.ts`
- Modify: `prisma/schema.prisma:95-110` (Board model)
- Modify: `lib/types.ts` (`Board.color`)
- Modify: `app/api/boards/[boardId]/route.ts` (PATCH)
- Modify: `tests/integration/api-routes.test.ts`

**Interfaces:**
- Produces: `BOARD_COLORS: readonly BoardColor[]`, `type BoardColor = 'amber' | 'sky' | 'emerald' | 'rose' | 'violet'`, `isBoardColor(value: unknown): value is BoardColor`, and `BOARD_COLOR_LABELS: Record<BoardColor, string>`. Task 7 imports all four.

`lib/boards/board-colors.ts` is imported by both a server route and client components, so it must contain no `'use client'` directive and no React.

- [ ] **Step 1: Write the palette module**

Create `lib/boards/board-colors.ts`:

```ts
/**
 * Curated board colours.
 *
 * Each token maps to a CSS variable defined for BOTH themes in globals.css,
 * so a coloured board stays readable in light and dark. Free-form hex cannot
 * do this — one value cannot serve two backgrounds.
 *
 * Imported by the API route as well as client components: keep this file
 * free of React and of the 'use client' directive.
 */
export const BOARD_COLORS = ['amber', 'sky', 'emerald', 'rose', 'violet'] as const;

export type BoardColor = (typeof BOARD_COLORS)[number];

export const BOARD_COLOR_LABELS: Record<BoardColor, string> = {
    amber: 'Amber',
    sky: 'Sky',
    emerald: 'Emerald',
    rose: 'Rose',
    violet: 'Violet',
};

export function isBoardColor(value: unknown): value is BoardColor {
    return (
        typeof value === 'string' &&
        (BOARD_COLORS as readonly string[]).includes(value)
    );
}
```

- [ ] **Step 2: Add the column to the schema**

In `prisma/schema.prisma`, add `color` to the `Board` model, after `description`:

```prisma
model Board {
  id          String    @id @default(cuid())
  title       String
  description String?
  color       String?
  ownerId     String
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  // Relations
  owner       User      @relation("BoardOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  columns     Column[]
  members     BoardMember[]

  @@index([ownerId])
}
```

- [ ] **Step 3: Create and apply the migration**

```bash
npx prisma migrate dev --name add_board_color
npx prisma generate
```

Expected: a new folder under `prisma/migrations/` containing `ALTER TABLE "Board" ADD COLUMN "color" TEXT;`. The column is nullable, so this is safe on existing rows — null means "no colour", the current neutral card.

- [ ] **Step 4: Add `color` to the Board type**

In `lib/types.ts`, add `color` to the `Board` interface after `description`:

```ts
  color: string | null;
```

(`UpdateBoardRequest.color` was already added in Task 4 Step 1.)

**This makes `color` a required field, so the two test factories written in
earlier tasks stop type-checking until they supply it.** Update both now:

In `tests/unit/group-boards.test.ts`, add to the object `makeBoard` returns,
after `description: null,`:

```ts
    color: null,
```

In `tests/components/board-card.test.tsx`, add to the object `makeBoard`
returns, after `description: 'Ship the new onboarding',`:

```tsx
        color: null,
```

Then confirm nothing else broke:

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: silent.

- [ ] **Step 5: Write the failing server tests**

Append to `tests/integration/api-routes.test.ts`:

```ts
// ── PATCH /api/boards/[boardId] colour validation ──────────────────────────────

describe('PATCH /api/boards/[boardId] colour', () => {
  it('accepts a colour from the palette', async () => {
    mockPrisma.board.findUnique.mockResolvedValue({
      ownerId: 'user-1',
      members: [],
    });
    mockPrisma.board.update.mockResolvedValue({
      id: 'board-1',
      title: 'Board',
      color: 'amber',
    });

    const { PATCH } = await import('@/app/api/boards/[boardId]/route');

    const req = new Request('http://localhost:3000/api/boards/board-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color: 'amber' }),
    });
    const res = await PATCH(req as never, {
      params: Promise.resolve({ boardId: 'board-1' }),
    });

    expect(res.status).toBe(200);
    expect(mockPrisma.board.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ color: 'amber' }) })
    );
  });

  it('accepts null to clear the colour', async () => {
    mockPrisma.board.findUnique.mockResolvedValue({
      ownerId: 'user-1',
      members: [],
    });
    mockPrisma.board.update.mockResolvedValue({ id: 'board-1', color: null });

    const { PATCH } = await import('@/app/api/boards/[boardId]/route');

    const req = new Request('http://localhost:3000/api/boards/board-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color: null }),
    });
    const res = await PATCH(req as never, {
      params: Promise.resolve({ boardId: 'board-1' }),
    });

    expect(res.status).toBe(200);
    expect(mockPrisma.board.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ color: null }) })
    );
  });

  it('rejects a colour outside the palette', async () => {
    mockPrisma.board.findUnique.mockResolvedValue({
      ownerId: 'user-1',
      members: [],
    });

    const { PATCH } = await import('@/app/api/boards/[boardId]/route');

    const req = new Request('http://localhost:3000/api/boards/board-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color: '#FEE35C' }),
    });
    const res = await PATCH(req as never, {
      params: Promise.resolve({ boardId: 'board-1' }),
    });

    expect(res.status).toBe(400);
    expect(mockPrisma.board.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

```bash
npx vitest run tests/integration/api-routes.test.ts
```

Expected: the "rejects a colour outside the palette" test FAILS with 200 instead of 400 (the route currently ignores `color` entirely, so it falls through to "No fields to update" — either way, not 400 for the right reason).

- [ ] **Step 7: Add validation to the PATCH route**

In `app/api/boards/[boardId]/route.ts`, add the import at the top:

```ts
import { isBoardColor } from '@/lib/boards/board-colors';
```

Then, inside `PATCH`, destructure `color` and add its validation block after the `description` block and before the `if (Object.keys(data).length === 0)` check:

```ts
  const { title, description, color } = body;
```

```ts
  if (color !== undefined) {
    if (color === null) {
      data.color = null;
    } else if (isBoardColor(color)) {
      data.color = color;
    } else {
      return NextResponse.json(
        { error: 'Invalid board color' },
        { status: 400 }
      );
    }
  }
```

Validating server-side matters: the client picker only ever offers palette tokens, but the endpoint is reachable directly, and an arbitrary string would be interpolated into a CSS variable name on render.

- [ ] **Step 8: Run the tests to verify they pass**

```bash
npx vitest run tests/integration/api-routes.test.ts
```

Expected: PASS, including the three new tests.

- [ ] **Step 9: Type-check and lint**

```bash
npx tsc --noEmit -p tsconfig.json
npx eslint --max-warnings 0 lib/boards app/api/boards tests/integration
```

Expected: both silent.

- [ ] **Step 10: Commit**

```bash
git add lib/boards/board-colors.ts prisma/schema.prisma prisma/migrations lib/types.ts app/api/boards/\[boardId\]/route.ts tests/integration/api-routes.test.ts
git commit -m "feat: add validated board color column and PATCH support"
```

---

### Task 7: Board colour — palette tokens, picker and card rendering

**Files:**
- Modify: `app/globals.css`
- Modify: `components/dashboard/board-settings-modal.tsx`
- Modify: `components/dashboard/board-card.tsx`
- Modify: `tests/components/board-card.test.tsx`

**Interfaces:**
- Consumes: `BOARD_COLORS`, `BOARD_COLOR_LABELS`, `isBoardColor` from `@/lib/boards/board-colors` (Task 6).

- [ ] **Step 1: Add the colour tokens**

In `app/globals.css`, add to the `:root` block, after `--destructive`:

```css
  --board-amber: #FEF3C7;
  --board-sky: #E0F2FE;
  --board-emerald: #D1FAE5;
  --board-rose: #FFE4E6;
  --board-violet: #EDE9FE;
```

And to the `.dark` block, after its `--destructive`:

```css
  --board-amber: #78350F;
  --board-sky: #0C4A6E;
  --board-emerald: #064E3B;
  --board-rose: #881337;
  --board-violet: #4C1D95;
```

These are chosen so `var(--foreground)` stays readable on them in both themes: dark `#111827` text on pale light tints, light `#f1f5f9` text on deep dark tints. Verify this in Step 6 rather than assuming it.

- [ ] **Step 2: Update the BoardCard test for colour**

In `tests/components/board-card.test.tsx` (the `color: null` default was
already added to `makeBoard` in Task 6 Step 4), append these tests inside the
existing `describe('BoardCard')`:

```tsx
    it('uses the card background when no colour is set', async () => {
        const { BoardCard } = await import('@/components/dashboard/board-card');

        const { container } = render(
            <BoardCard
                board={makeBoard({ color: null })}
                onDelete={vi.fn()}
                onOpenSettings={vi.fn()}
            />
        );

        const card = container.querySelector('a');
        expect(card?.style.background).toBe('');
    });

    it('applies the board colour variable when set', async () => {
        const { BoardCard } = await import('@/components/dashboard/board-card');

        const { container } = render(
            <BoardCard
                board={makeBoard({ color: 'amber' })}
                onDelete={vi.fn()}
                onOpenSettings={vi.fn()}
            />
        );

        const card = container.querySelector('a');
        expect(card?.style.background).toContain('--board-amber');
    });

    it('ignores a colour that is not in the palette', async () => {
        const { BoardCard } = await import('@/components/dashboard/board-card');

        const { container } = render(
            <BoardCard
                board={makeBoard({ color: 'url(evil)' })}
                onDelete={vi.fn()}
                onOpenSettings={vi.fn()}
            />
        );

        const card = container.querySelector('a');
        expect(card?.style.background).toBe('');
    });
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
npx vitest run tests/components/board-card.test.tsx
```

Expected: the two colour tests FAIL — the card sets no background style yet.

- [ ] **Step 4: Render the colour on the card**

In `components/dashboard/board-card.tsx`, add the import:

```tsx
import { isBoardColor } from '@/lib/boards/board-colors';
```

Inside the component, above the `return`:

```tsx
    const isOwner = board.currentUserRole === 'OWNER';
    // Guard again on render: the value reaches the DOM as a CSS variable name.
    const background = isBoardColor(board.color)
        ? `var(--board-${board.color})`
        : undefined;
```

Then change the `<Link>` to drop the `bg-[var(--card)]` class and take the style:

```tsx
        <Link
            href={`/boards/${board.id}`}
            style={background ? { background } : undefined}
            className="group relative rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm transition-all hover:border-[var(--accent)] hover:shadow-md"
        >
```

The inline style overrides the `bg-[var(--card)]` class when present, so the class can stay as the default.

- [ ] **Step 5: Add the colour picker to the modal**

In `components/dashboard/board-settings-modal.tsx`, extend the imports:

```tsx
import {
    BOARD_COLORS,
    BOARD_COLOR_LABELS,
    type BoardColor,
} from '@/lib/boards/board-colors';
```

Add state beside `title` / `description`:

```tsx
    const [color, setColor] = useState<BoardColor | null>(null);
```

Extend the existing `useEffect` that re-seeds the form:

```tsx
    useEffect(() => {
        if (board) {
            setTitle(board.title);
            setDescription(board.description ?? '');
            setColor((board.color as BoardColor | null) ?? null);
        }
    }, [board]);
```

Include the colour in the save:

```tsx
        updateBoard.mutate(
            { title: title.trim(), description: description.trim(), color },
            { onSuccess: onClose }
        );
```

And insert this block inside the settings `<form>`, after the description field and before the Cancel/Save row:

```tsx
                <div>
                    <span className="block text-sm font-medium text-[var(--foreground)]">
                        Colour
                    </span>
                    <div className="mt-2 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => setColor(null)}
                            aria-label="No colour"
                            aria-pressed={color === null}
                            className={`h-8 w-8 rounded-full border-2 bg-[var(--card)] transition-all ${
                                color === null
                                    ? 'border-[var(--accent)] scale-110'
                                    : 'border-[var(--border)]'
                            }`}
                        />
                        {BOARD_COLORS.map((swatch) => (
                            <button
                                key={swatch}
                                type="button"
                                onClick={() => setColor(swatch)}
                                aria-label={BOARD_COLOR_LABELS[swatch]}
                                aria-pressed={color === swatch}
                                style={{ background: `var(--board-${swatch})` }}
                                className={`h-8 w-8 rounded-full border-2 transition-all ${
                                    color === swatch
                                        ? 'border-[var(--accent)] scale-110'
                                        : 'border-[var(--border)]'
                                }`}
                            />
                        ))}
                    </div>
                </div>
```

- [ ] **Step 6: Run the full suite**

```bash
npx vitest run
npx tsc --noEmit -p tsconfig.json
npx eslint --max-warnings 0 components/dashboard app/dashboard lib/boards
```

Expected: all passing / silent.

- [ ] **Step 7: Verify contrast in the browser, in both themes**

Start the dev server, set a colour on a board, then run this in the browser console (or via Playwright MCP) on `/dashboard` in **both** light and dark:

```js
(() => {
  const parse = (c) => (c.match(/[\d.]+/g) || []).map(Number);
  const lum = (c) => {
    const [r, g, b] = parse(c).slice(0, 3).map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
    return +((l1 + 0.05) / (l2 + 0.05)).toFixed(2);
  };
  return [...document.querySelectorAll('a[href^="/boards/"]')].map((el) => {
    const cs = getComputedStyle(el);
    const h3 = el.querySelector('h3');
    return {
      title: h3?.textContent?.trim(),
      contrast: ratio(getComputedStyle(h3).color, cs.backgroundColor),
    };
  });
})();
```

Every card must report **contrast ≥ 4.5** in both themes. If a token fails, adjust that token's value in `globals.css` and re-measure — do not ship a failing pair.

- [ ] **Step 8: Commit**

```bash
git add app/globals.css components/dashboard tests/components/board-card.test.tsx
git commit -m "feat: add board color picker with theme-safe palette tokens"
```

---

## Self-Review Notes

Checked after writing:

- **Design coverage:** component extraction (Tasks 2–3), grouping partition (Task 1), rename + description (Task 4), add member (Task 5), colour (Tasks 6–7). All four features plus the extraction are covered.
- **Type consistency:** `groupBoards` / `GroupedBoards` / `BoardGroupKey` (Task 1) are used with those exact names in Task 3. `BoardCard`'s `onDelete(boardId: string)` and `onOpenSettings(board: Board)` are identical in Tasks 2, 3 and 5. `BOARD_COLORS`, `BOARD_COLOR_LABELS`, `isBoardColor`, `BoardColor` (Task 6) match their uses in Task 7.
- **Ordering dependency:** `UpdateBoardRequest.color` is added in Task 4 rather than Task 6 so the modal's mutation type never changes mid-plan. Making `Board.color` required in Task 6 breaks the test factories written in Tasks 1 and 2, so Task 6 Step 4 updates both in the same step that introduces the field — otherwise the tree would not type-check between Tasks 6 and 7.
- **Verified against the codebase, not assumed:** `withAuth` awaits `context.params` via `Promise.resolve`, so passing a Promise is correct; existing integration tests pass a plain `Request` with an `as never` cast because the handler is typed for `NextRequest`, and the new PATCH tests follow that same convention. `session.user.id` is available client-side (used in `lib/websocket-provider.tsx:196`).
- **Known gap, deliberate:** cards show a member *count*, not avatars. Adding avatars would require widening `GET /api/boards` to return member rows for every board, which would load every member of every board on dashboard render. The settings modal fetches the real list via `useMembers` on open instead. Revisit only if the product wants avatars on the grid.
