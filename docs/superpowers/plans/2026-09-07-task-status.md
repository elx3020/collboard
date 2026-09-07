# Task Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every task a three-value `status` (incompleted / completed / archived), toggleable from the card and the detail modal, filterable from the board header, and announced to the people involved in that task.

**Architecture:** `status` is an ordinary `Task` column, so writes ride the existing `PATCH /api/boards/[boardId]/tasks/[taskId]` route (validate → update → `publishEvent` → conditionally `notify`) rather than a new sub-route. Archived tasks are excluded by the board query on the server; a header filter passes `?status=` back to that same endpoint and is part of the React Query key. Notifications reuse the existing `taskAudience()` fan-out (assignee + commenters) under one new `TASK_STATUS_CHANGED` type carrying the new status in `meta`.

**Tech Stack:** Next.js 15 App Router, Prisma 7 (`@prisma/adapter-pg`), PostgreSQL, React Query v5, Zustand, `@dnd-kit`, Tailwind, Vitest (+ happy-dom for components), Playwright.

**Spec:** None. The design was agreed in conversation and is restated in full under "Design Summary" below — that section is the spec this plan argues from.

## Global Constraints

- Workspace is `apps/web`. All paths below are relative to the repo root; run all commands from `apps/web` unless stated otherwise.
- Enum values are exactly `INCOMPLETED`, `COMPLETED`, `ARCHIVED` — the user's spelling, including the non-standard "INCOMPLETED". UI labels use the same words.
- The new notification type is exactly `TASK_STATUS_CHANGED`. One type covers all three transitions; do not add three types.
- Lint is `--max-warnings 0` and `eslint-plugin-only-warn` downgrades errors to warnings, so *any* lint finding fails the build. Run `npm run lint` before every commit.
- Prisma Client must be generated before lint/type-check/build will pass: `npx prisma generate`.
- Server-side logging goes through `lib/logger.ts` (pino), never `console`.
- Icons live one-per-file in `components/icons/`, re-exported from the barrel, props spread last, `aria-hidden` by default. Never inline an `<svg>` in a feature component.
- Component tests opt into happy-dom with `// @vitest-environment happy-dom` on line 1. Integration tests mock `@/lib/prisma` and `next-auth/next`; they never touch a database.
- Do not add optimistic updates. Every mutation in this codebase invalidates and refetches; status follows that pattern.

## Design Summary

**Data.** `TaskStatus` enum (`INCOMPLETED` | `COMPLETED` | `ARCHIVED`) on `Task`, defaulting to `INCOMPLETED`. Postgres backfills existing rows from the default, so there is no data migration. No new index: the status filter is a residual filter on a per-column row set that `@@index([columnId, order])` already serves.

**Write path.** `PATCH /api/boards/[boardId]/tasks/[taskId]` accepts `status`, validated like the existing `priority` field (400 on anything else). Permission reuses `task:edit`, already required at the top of that handler, so VIEWERs cannot toggle. A notification fires only when the status actually changed, mirroring the existing assignee guard so re-saving the same value does not re-notify.

**Read path.** `GET /api/boards/[boardId]` accepts `?status=`. Absent means `status: { not: 'ARCHIVED' }`; `INCOMPLETED` / `COMPLETED` / `ARCHIVED` match exactly; anything else is a 400.

**Notifications.** `TASK_STATUS_CHANGED` resolves through the existing `taskAudience()` (assignee + distinct commenters, actor and muted users stripped). `meta.status` carries the new value, and `formatNotification` renders "completed" / "reopened" / "archived", with a generic fallback when meta is missing.

**UI.** Card top-right gains a status toggle button beside the comment count; it flips INCOMPLETED ↔ COMPLETED only, stops propagation so it neither opens the modal nor starts a drag, and renders the archive glyph as a non-interactive indicator for archived tasks. Completed cards get a struck-through title and dimming. The detail modal gets a three-way segmented control below the description that joins the existing save-on-close batching. The board header gets a status `<select>` beside the priority filter, which drives a server query param.

**Known issue, deliberately out of scope:** dragging while a filter is active computes `order` from the visible subset, so drops can land at the wrong index. This bug already exists with the priority filter; the status filter will expose it more often. Not fixed here.

---

### Task 1: Schema, enum, and shared types

Foundation. Nothing else compiles without it.

**Files:**
- Modify: `apps/web/prisma/schema.prisma`
- Create: `apps/web/prisma/migrations/<generated>/migration.sql` (written by Prisma, not by hand)
- Modify: `apps/web/lib/types.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `TaskStatus` (`'INCOMPLETED' | 'COMPLETED' | 'ARCHIVED'`), `BoardStatusFilter` (`'ACTIVE' | TaskStatus`), `Task.status: TaskStatus`, `UpdateTaskRequest.status?: TaskStatus`, `NotificationMeta.status?: TaskStatus`, and `'TASK_STATUS_CHANGED'` in the `NotificationType` union.

- [ ] **Step 1: Add the enum and column to the Prisma schema**

In `apps/web/prisma/schema.prisma`, add `status` to the `Task` model, immediately after the `priority` line:

```prisma
  priority    Priority  @default(MEDIUM)
  status      TaskStatus @default(INCOMPLETED)
```

Add the enum next to the existing `Priority` enum:

```prisma
enum TaskStatus {
  INCOMPLETED
  COMPLETED
  ARCHIVED
}
```

Add the new value to the end of the `NotificationType` enum:

```prisma
enum NotificationType {
  TASK_ASSIGNED
  TASK_COMMENTED
  BOARD_INVITED
  BOARD_ROLE_CHANGED
  BOARD_TASK_ADDED
  BOARD_TASK_REMOVED
  TASK_STATUS_CHANGED
}
```

- [ ] **Step 2: Generate and apply the migration**

Postgres and Redis must be up first (`docker-compose up -d` from the repo root).

Run: `cd apps/web && npx prisma migrate dev --name add_task_status`
Expected: a new folder under `prisma/migrations/`, and "Your database is now in sync with your schema."

- [ ] **Step 3: Regenerate the Prisma client**

Run: `cd apps/web && npx prisma generate`
Expected: "Generated Prisma Client".

- [ ] **Step 4: Add the shared types**

In `apps/web/lib/types.ts`, add below the existing `Priority` line (currently line 110):

```ts
export type TaskStatus = 'INCOMPLETED' | 'COMPLETED' | 'ARCHIVED';

/**
 * What the board header's status filter can ask for. `ACTIVE` is the default
 * view — everything except archived — and is not a stored value.
 */
export type BoardStatusFilter = 'ACTIVE' | TaskStatus;
```

Add `status` to the `Task` interface, after `priority`:

```ts
  priority: Priority;
  status: TaskStatus;
```

Add `status` to `UpdateTaskRequest`:

```ts
export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  assigneeId?: string | null;
  priority?: Priority;
  status?: TaskStatus;
}
```

Add the new member to the `NotificationType` union:

```ts
export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'TASK_COMMENTED'
  | 'BOARD_INVITED'
  | 'BOARD_ROLE_CHANGED'
  | 'BOARD_TASK_ADDED'
  | 'BOARD_TASK_REMOVED'
  | 'TASK_STATUS_CHANGED';
```

Extend `NotificationMeta` and update its doc comment, which currently claims only one type uses it:

```ts
/**
 * Type-specific extras. `BOARD_ROLE_CHANGED` carries the new role;
 * `TASK_STATUS_CHANGED` carries the status the task moved to.
 *
 * A type alias rather than an interface on purpose: Prisma's `InputJsonValue`
 * requires an implicit index signature, which TypeScript grants to aliases but
 * not to interfaces.
 */
export type NotificationMeta = {
  role?: Role;
  status?: TaskStatus;
};
```

- [ ] **Step 5: Verify types compile**

Run: `cd /home/elx3020/collboard && npm run check-types`
Expected: PASS. The existing test suite will not compile against `Task.status` yet — that is fine, `check-types` covers app code.

- [ ] **Step 6: Commit**

```bash
git add apps/web/prisma/schema.prisma apps/web/prisma/migrations apps/web/lib/types.ts
git commit -m "feat: add task status enum, column, and shared types

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Notification copy and recipients

**Files:**
- Modify: `apps/web/lib/notifications/recipients.ts`
- Modify: `apps/web/lib/notifications/format.ts`
- Test: `apps/web/tests/unit/notification-recipients.test.ts`
- Test: `apps/web/tests/unit/notification-format.test.ts`

**Interfaces:**
- Consumes: `TaskStatus`, `NotificationType`, `NotificationMeta` from Task 1.
- Produces: `NotifyEvent` variant `{ type: 'TASK_STATUS_CHANGED'; taskId: string }`, consumed by Task 4.

- [ ] **Step 1: Write the failing recipient tests**

Append to the `describe('resolveRecipients', ...)` block in `apps/web/tests/unit/notification-recipients.test.ts`:

```ts
  it('notifies the assignee and prior commenters on TASK_STATUS_CHANGED', async () => {
    mockPrisma.task.findUnique.mockResolvedValue({ assigneeId: 'user-2' });
    mockPrisma.comment.findMany.mockResolvedValue([
      { userId: 'user-3' },
      { userId: 'user-3' },
    ]);

    const result = await resolveRecipients(
      { type: 'TASK_STATUS_CHANGED', taskId: 'task-1' },
      'user-1',
    );

    expect(result.sort()).toEqual(['user-2', 'user-3']);
  });

  it('does not notify the person who changed the status', async () => {
    mockPrisma.task.findUnique.mockResolvedValue({ assigneeId: 'user-1' });
    mockPrisma.comment.findMany.mockResolvedValue([]);

    const result = await resolveRecipients(
      { type: 'TASK_STATUS_CHANGED', taskId: 'task-1' },
      'user-1',
    );

    expect(result).toEqual([]);
  });

  it('drops recipients who muted TASK_STATUS_CHANGED', async () => {
    mockPrisma.task.findUnique.mockResolvedValue({ assigneeId: 'user-2' });
    mockPrisma.comment.findMany.mockResolvedValue([{ userId: 'user-3' }]);
    // Only user-3 comes back from the "has not muted" query.
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'user-3' }]);

    const result = await resolveRecipients(
      { type: 'TASK_STATUS_CHANGED', taskId: 'task-1' },
      'user-1',
    );

    expect(result).toEqual(['user-3']);
  });
```

- [ ] **Step 2: Write the failing format tests**

Append to `apps/web/tests/unit/notification-format.test.ts`, inside the existing `describe` block:

```ts
  it('names the completion of a task', () => {
    expect(
      formatNotification(make('TASK_STATUS_CHANGED', { meta: { status: 'COMPLETED' } })),
    ).toBe('Ada completed Fix login');
  });

  it('calls a return to incompleted a reopen', () => {
    expect(
      formatNotification(make('TASK_STATUS_CHANGED', { meta: { status: 'INCOMPLETED' } })),
    ).toBe('Ada reopened Fix login');
  });

  it('names an archive', () => {
    expect(
      formatNotification(make('TASK_STATUS_CHANGED', { meta: { status: 'ARCHIVED' } })),
    ).toBe('Ada archived Fix login');
  });

  it('falls back to a generic phrase when meta is missing', () => {
    expect(formatNotification(make('TASK_STATUS_CHANGED', { meta: null }))).toBe(
      'Ada changed the status of Fix login',
    );
  });

  it('falls back for a deleted actor and task', () => {
    expect(
      formatNotification(
        make('TASK_STATUS_CHANGED', {
          actorName: null,
          taskTitle: null,
          meta: { status: 'COMPLETED' },
        }),
      ),
    ).toBe('Someone completed a task');
  });
```

- [ ] **Step 3: Run both test files to verify they fail**

Run: `cd apps/web && npx vitest run tests/unit/notification-recipients.test.ts tests/unit/notification-format.test.ts`
Expected: FAIL. The recipients file errors on the unknown `TASK_STATUS_CHANGED` event type; the format file returns `undefined` for the unhandled case.

- [ ] **Step 4: Add the event variant and fan-out**

In `apps/web/lib/notifications/recipients.ts`, add to the `NotifyEvent` union:

```ts
export type NotifyEvent =
  | { type: 'TASK_ASSIGNED'; assigneeId: string | null }
  | { type: 'TASK_COMMENTED'; taskId: string }
  | { type: 'TASK_STATUS_CHANGED'; taskId: string }
  | { type: 'BOARD_INVITED'; targetUserId: string }
  | { type: 'BOARD_ROLE_CHANGED'; targetUserId: string }
  | { type: 'BOARD_TASK_ADDED'; boardId: string }
  | { type: 'BOARD_TASK_REMOVED'; boardId: string };
```

In the `switch` inside `resolveRecipients`, add the new type to the existing `TASK_COMMENTED` case — the audience is identical:

```ts
    case 'TASK_COMMENTED':
    case 'TASK_STATUS_CHANGED':
      candidates = await taskAudience(event.taskId);
      break;
```

- [ ] **Step 5: Add the display copy**

In `apps/web/lib/notifications/format.ts`, extend the import and add the case:

```ts
import type { AppNotification, TaskStatus } from '@/lib/types';
```

```ts
    case 'TASK_STATUS_CHANGED': {
      const verbs: Record<TaskStatus, string> = {
        COMPLETED: 'completed',
        INCOMPLETED: 'reopened',
        ARCHIVED: 'archived',
      };
      const status = n.meta?.status;
      return status
        ? `${actor} ${verbs[status]} ${task}`
        : `${actor} changed the status of ${task}`;
    }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/unit/notification-recipients.test.ts tests/unit/notification-format.test.ts`
Expected: PASS.

- [ ] **Step 7: Lint and commit**

```bash
cd /home/elx3020/collboard && npm run lint
git add apps/web/lib/notifications apps/web/tests/unit/notification-recipients.test.ts apps/web/tests/unit/notification-format.test.ts
git commit -m "feat: notify a task's assignee and commenters on status changes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Status icons

**Files:**
- Create: `apps/web/components/icons/circle-icon.tsx`
- Create: `apps/web/components/icons/check-circle-icon.tsx`
- Create: `apps/web/components/icons/archive-icon.tsx`
- Modify: `apps/web/components/icons/index.ts`
- Test: `apps/web/tests/components/status-icons.test.tsx`

**Interfaces:**
- Consumes: `StrokeIcon`, `IconProps` from `components/icons/icon.tsx`.
- Produces: `CircleIcon`, `CheckCircleIcon`, `ArchiveIcon`, each `(props: IconProps) => JSX.Element`, exported from `@/components/icons`. Used by Tasks 7, 8 and 10.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/components/status-icons.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import { CircleIcon, CheckCircleIcon, ArchiveIcon } from '@/components/icons';

describe('status icons', () => {
    it('renders each glyph as a decorative svg', () => {
        for (const Icon of [CircleIcon, CheckCircleIcon, ArchiveIcon]) {
            const { container, unmount } = render(<Icon />);
            const svg = container.querySelector('svg');
            expect(svg).not.toBeNull();
            expect(svg?.getAttribute('aria-hidden')).toBe('true');
            unmount();
        }
    });

    it('lets the call site own the size', () => {
        const { container } = render(<CheckCircleIcon className="h-3.5 w-3.5" />);
        expect(container.querySelector('svg')?.getAttribute('class')).toBe('h-3.5 w-3.5');
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run tests/components/status-icons.test.tsx`
Expected: FAIL — `CircleIcon` is not exported from `@/components/icons`.

- [ ] **Step 3: Create the three icons**

`apps/web/components/icons/circle-icon.tsx`:

```tsx
import { StrokeIcon, type IconProps } from './icon';

export function CircleIcon(props: IconProps) {
    return (
        <StrokeIcon {...props}>
            <circle cx="12" cy="12" r="9" />
        </StrokeIcon>
    );
}
```

`apps/web/components/icons/check-circle-icon.tsx`:

```tsx
import { StrokeIcon, type IconProps } from './icon';

export function CheckCircleIcon(props: IconProps) {
    return (
        <StrokeIcon {...props}>
            <circle cx="12" cy="12" r="9" />
            <path d="m8.5 12.5 2.5 2.5 4.5-5" />
        </StrokeIcon>
    );
}
```

`apps/web/components/icons/archive-icon.tsx`:

```tsx
import { StrokeIcon, type IconProps } from './icon';

export function ArchiveIcon(props: IconProps) {
    return (
        <StrokeIcon {...props}>
            <rect x="3" y="4" width="18" height="4" rx="1" />
            <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
            <path d="M10 12h4" />
        </StrokeIcon>
    );
}
```

- [ ] **Step 4: Export them from the barrel**

In `apps/web/components/icons/index.ts`, keep the alphabetical ordering of the existing block:

```ts
export { AlertTriangleIcon } from './alert-triangle-icon';
export { ArchiveIcon } from './archive-icon';
export { BellIcon } from './bell-icon';
export { CheckCircleIcon } from './check-circle-icon';
export { ChevronDownIcon } from './chevron-down-icon';
export { ChevronLeftIcon } from './chevron-left-icon';
export { CircleIcon } from './circle-icon';
export { CloseIcon } from './close-icon';
```

(Leave the remaining exports untouched.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run tests/components/status-icons.test.tsx`
Expected: PASS.

- [ ] **Step 6: Lint and commit**

```bash
cd /home/elx3020/collboard && npm run lint
git add apps/web/components/icons apps/web/tests/components/status-icons.test.tsx
git commit -m "feat: add circle, check-circle and archive icons

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: PATCH accepts and announces a status change

**Files:**
- Modify: `apps/web/app/api/boards/[boardId]/tasks/[taskId]/route.ts`
- Test: `apps/web/tests/integration/task-status-routes.test.ts` (create)

**Interfaces:**
- Consumes: `TaskStatus` (Task 1), the `TASK_STATUS_CHANGED` `NotifyEvent` variant (Task 2).
- Produces: `PATCH` accepting `{ status }`; a module-local `notificationContext(userId, boardId)` helper returning `{ actorName: string | null; boardTitle: string | null }`.

- [ ] **Step 1: Write the failing integration test**

Create `apps/web/tests/integration/task-status-routes.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Status is the one task field a card can change without opening anything, so
 * these tests pin down what the server accepts and when it tells people.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockPrisma = {
  board: { findUnique: vi.fn() },
  task: { findFirst: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

const mockSession = { user: { id: 'user-1', email: 'ada@example.com', name: 'Ada' } };
vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(() => Promise.resolve(mockSession)),
}));
vi.mock('@/lib/auth/auth-options', () => ({ authOptions: {} }));

vi.mock('@/lib/redis', () => ({
  publishEvent: vi.fn(),
  CHANNELS: { BOARD: (id: string) => `board:${id}`, USER: (id: string) => `user:${id}` },
  EventType: { TASK_UPDATED: 'task:updated', TASK_DELETED: 'task:deleted' },
}));

const notify = vi.fn();
vi.mock('@/lib/notifications/notify', () => ({ notify: (...a: unknown[]) => notify(...a) }));

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.board.findUnique.mockImplementation((args: any) => {
    if (args?.select?.members === undefined && args?.select?.title) {
      return Promise.resolve({ title: 'Roadmap' });
    }
    return Promise.resolve({ id: 'board-1', title: 'Roadmap', ownerId: 'user-1', members: [] });
  });
  mockPrisma.user.findUnique.mockResolvedValue({ name: 'Ada' });
  // The task as it stands before the edit.
  mockPrisma.task.findFirst.mockResolvedValue({
    id: 'task-1',
    title: 'Fix login',
    columnId: 'col-1',
    assigneeId: null,
    status: 'INCOMPLETED',
    column: { boardId: 'board-1' },
  });
  mockPrisma.task.update.mockImplementation((args: any) =>
    Promise.resolve({
      id: 'task-1',
      title: 'Fix login',
      assigneeId: null,
      status: 'INCOMPLETED',
      ...args.data,
      assignee: null,
    }),
  );
});

const ctx = () => ({ params: Promise.resolve({ boardId: 'board-1', taskId: 'task-1' }) }) as never;

function patchRequest(body: unknown) {
  return new Request('http://localhost/api/boards/board-1/tasks/task-1', {
    method: 'PATCH',
    body: JSON.stringify(body),
  }) as never;
}

describe('PATCH /api/boards/[boardId]/tasks/[taskId] — status', () => {
  it('stores a valid status', async () => {
    const { PATCH } = await import('@/app/api/boards/[boardId]/tasks/[taskId]/route');
    const res = await PATCH(patchRequest({ status: 'COMPLETED' }), ctx());

    expect(res.status).toBe(200);
    expect(mockPrisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
    );
  });

  it('accepts a lowercase status, like priority does', async () => {
    const { PATCH } = await import('@/app/api/boards/[boardId]/tasks/[taskId]/route');
    await PATCH(patchRequest({ status: 'archived' }), ctx());

    expect(mockPrisma.task.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'ARCHIVED' }) }),
    );
  });

  it('rejects an unknown status', async () => {
    const { PATCH } = await import('@/app/api/boards/[boardId]/tasks/[taskId]/route');
    const res = await PATCH(patchRequest({ status: 'DONE_ISH' }), ctx());

    expect(res.status).toBe(400);
    expect(mockPrisma.task.update).not.toHaveBeenCalled();
  });

  it('notifies the task audience with the new status in meta', async () => {
    const { PATCH } = await import('@/app/api/boards/[boardId]/tasks/[taskId]/route');
    await PATCH(patchRequest({ status: 'COMPLETED' }), ctx());

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        event: { type: 'TASK_STATUS_CHANGED', taskId: 'task-1' },
        actorId: 'user-1',
        taskId: 'task-1',
        taskTitle: 'Fix login',
        meta: { status: 'COMPLETED' },
      }),
    );
  });

  it('does not notify when the status is re-saved unchanged', async () => {
    const { PATCH } = await import('@/app/api/boards/[boardId]/tasks/[taskId]/route');
    await PATCH(patchRequest({ status: 'INCOMPLETED' }), ctx());

    expect(notify).not.toHaveBeenCalled();
  });

  it('does not notify on a title-only edit', async () => {
    const { PATCH } = await import('@/app/api/boards/[boardId]/tasks/[taskId]/route');
    await PATCH(patchRequest({ title: 'Fix the login bug' }), ctx());

    expect(notify).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run tests/integration/task-status-routes.test.ts`
Expected: FAIL — the route ignores `status`, so `task.update` is called without it and the "No fields to update" branch returns 400.

- [ ] **Step 3: Accept and validate the field**

In `apps/web/app/api/boards/[boardId]/tasks/[taskId]/route.ts`, add the constant below the imports:

```ts
const VALID_STATUSES = ['INCOMPLETED', 'COMPLETED', 'ARCHIVED'];
```

Destructure the new field:

```ts
  const { title, description, priority, assigneeId, status } = body;
```

Add the validation block directly after the `priority` block:

```ts
  if (status !== undefined) {
    if (typeof status !== 'string' || !VALID_STATUSES.includes(status.toUpperCase())) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }
    data.status = status.toUpperCase();
  }
```

- [ ] **Step 4: Hoist the notification lookup and add the status notification**

Add this helper above the `PATCH` export:

```ts
/**
 * The actor's name and the board's title, snapshotted onto a notification so it
 * still reads correctly after either is renamed or deleted. Fetched once per
 * request: a single PATCH can raise two notifications.
 */
async function notificationContext(userId: string, boardId: string) {
  const [actor, boardRow] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    prisma.board.findUnique({ where: { id: boardId }, select: { title: true } }),
  ]);

  return { actorName: actor?.name ?? null, boardTitle: boardRow?.title ?? null };
}
```

Replace the whole trailing `if (assigneeId !== undefined && ...)` notification block in `PATCH` with:

```ts
  // Only a real change is worth a notification: title and priority edits are
  // not, and re-saving the same value must not re-notify.
  const newAssigneeId =
    assigneeId !== undefined && task.assigneeId && task.assigneeId !== existing.assigneeId
      ? task.assigneeId
      : null;
  const newStatus =
    status !== undefined && task.status !== existing.status ? task.status : null;

  if (newAssigneeId || newStatus) {
    const context = await notificationContext(userId, boardId);
    const base = {
      actorId: userId,
      ...context,
      boardId,
      taskId: task.id,
      taskTitle: task.title,
    };

    if (newAssigneeId) {
      await notify({ ...base, event: { type: 'TASK_ASSIGNED', assigneeId: newAssigneeId } });
    }

    if (newStatus) {
      await notify({
        ...base,
        event: { type: 'TASK_STATUS_CHANGED', taskId: task.id },
        meta: { status: newStatus },
      });
    }
  }
```

- [ ] **Step 5: Use the helper in DELETE too**

The `DELETE` handler further down holds the same two-query lookup inline. Replace its `const [actor, boardRow] = await Promise.all([...])` block and the `actorName` / `boardTitle` lines in its `notify` call with the helper, leaving the rest of the call unchanged:

```ts
  const context = await notificationContext(userId, boardId);

  await notify({
    event: { type: 'BOARD_TASK_REMOVED', boardId },
    actorId: userId,
    ...context,
    boardId,
    // The task is gone, so the notification links to the board instead.
    taskId: null,
    taskTitle: existing.title,
  });
```

- [ ] **Step 6: Run the new and neighbouring tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/integration/task-status-routes.test.ts tests/integration/task-assignee-routes.test.ts`
Expected: PASS, both files. The assignee file proves the hoist did not change assignment behaviour.

- [ ] **Step 7: Lint and commit**

```bash
cd /home/elx3020/collboard && npm run lint
git add "apps/web/app/api/boards/[boardId]/tasks/[taskId]/route.ts" apps/web/tests/integration/task-status-routes.test.ts
git commit -m "feat: accept a task status on PATCH and notify on change

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Board GET filters by status

**Files:**
- Modify: `apps/web/app/api/boards/[boardId]/route.ts`
- Test: `apps/web/tests/integration/board-status-filter.test.ts` (create)

**Interfaces:**
- Consumes: `TaskStatus` (Task 1).
- Produces: `GET /api/boards/[boardId]?status=` — absent excludes `ARCHIVED`, a valid value matches exactly, anything else is a 400. Consumed by Task 6.

- [ ] **Step 1: Write the failing integration test**

Create `apps/web/tests/integration/board-status-filter.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Archived tasks are excluded by the server, not hidden by the client, so the
 * board query's `where` clause is the whole contract.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockPrisma = {
  board: { findUnique: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

const mockSession = { user: { id: 'user-1', email: 'ada@example.com', name: 'Ada' } };
vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(() => Promise.resolve(mockSession)),
}));
vi.mock('@/lib/auth/auth-options', () => ({ authOptions: {} }));

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.board.findUnique.mockResolvedValue({
    id: 'board-1',
    title: 'Roadmap',
    ownerId: 'user-1',
    members: [],
    columns: [],
  });
});

const ctx = () => ({ params: Promise.resolve({ boardId: 'board-1' }) }) as never;

const request = (query = '') =>
  new Request(`http://localhost/api/boards/board-1${query}`) as never;

/** The `where` Prisma was asked to apply to the nested tasks. */
function taskWhere() {
  const args = mockPrisma.board.findUnique.mock.calls.at(-1)?.[0] as any;
  return args.include.columns.include.tasks.where;
}

describe('GET /api/boards/[boardId] — status filter', () => {
  it('hides archived tasks when no filter is given', async () => {
    const { GET } = await import('@/app/api/boards/[boardId]/route');
    const res = await GET(request(), ctx());

    expect(res.status).toBe(200);
    expect(taskWhere()).toEqual({ status: { not: 'ARCHIVED' } });
  });

  it('returns only archived tasks when asked for them', async () => {
    const { GET } = await import('@/app/api/boards/[boardId]/route');
    await GET(request('?status=ARCHIVED'), ctx());

    expect(taskWhere()).toEqual({ status: 'ARCHIVED' });
  });

  it('returns only completed tasks when asked for them', async () => {
    const { GET } = await import('@/app/api/boards/[boardId]/route');
    await GET(request('?status=COMPLETED'), ctx());

    expect(taskWhere()).toEqual({ status: 'COMPLETED' });
  });

  it('rejects an unknown status', async () => {
    const { GET } = await import('@/app/api/boards/[boardId]/route');
    const res = await GET(request('?status=SOMEDAY'), ctx());

    expect(res.status).toBe(400);
    expect(mockPrisma.board.findUnique).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run tests/integration/board-status-filter.test.ts`
Expected: FAIL — `taskWhere()` throws because the query has no `where` on tasks.

- [ ] **Step 3: Read and apply the param**

In `apps/web/app/api/boards/[boardId]/route.ts`, add below the imports:

```ts
const TASK_STATUSES = ['INCOMPLETED', 'COMPLETED', 'ARCHIVED'];
```

Rename the unused `_req` to `req` in the `GET` signature and add the param handling before the query:

```ts
export const GET = withAuth<{ boardId: string }>(async (req, { params, userId }) => {
  const { boardId } = params;

  await requireBoardPermission(userId, boardId, 'board:view');

  const status = new URL(req.url).searchParams.get('status');

  if (status !== null && !TASK_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${TASK_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  // No filter means "everything except archived": archived tasks stay out of
  // the board until the header filter asks for them by name.
  const taskWhere = status
    ? { status: status as TaskStatus }
    : { status: { not: 'ARCHIVED' as const } };
```

Add the type import at the top of the file:

```ts
import type { TaskStatus } from '@/lib/types';
```

Add the `where` to the nested tasks include:

```ts
          tasks: {
            where: taskWhere,
            orderBy: { order: 'asc' },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run tests/integration/board-status-filter.test.ts`
Expected: PASS.

- [ ] **Step 5: Lint, type-check and commit**

```bash
cd /home/elx3020/collboard && npm run lint && npm run check-types
git add "apps/web/app/api/boards/[boardId]/route.ts" apps/web/tests/integration/board-status-filter.test.ts
git commit -m "feat: exclude archived tasks from the board unless asked for

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Client data layer — api, query key, store

**Files:**
- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/lib/hooks/use-queries.ts`
- Modify: `apps/web/lib/stores/ui-store.ts`
- Test: `apps/web/tests/unit/board-status-api.test.ts` (create)

**Interfaces:**
- Consumes: `BoardStatusFilter`, `TaskStatus` (Task 1); `?status=` (Task 5).
- Produces: `boardsApi.get(boardId, status?)`; `queryKeys.boardFiltered(id, status)`; `useBoard(boardId, status?)`; `useUIStore` fields `statusFilter: BoardStatusFilter` and `setStatusFilter`. Consumed by Task 9.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/unit/board-status-api.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { boardsApi } from '@/lib/api';
import { queryKeys } from '@/lib/hooks/use-queries';
import { useUIStore } from '@/lib/stores/ui-store';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
  useUIStore.setState({ statusFilter: 'ACTIVE' });
});

describe('boardsApi.get', () => {
  it('omits the query string for the default view', async () => {
    await boardsApi.get('board-1');
    expect(fetchMock).toHaveBeenCalledWith('/api/boards/board-1', expect.objectContaining({}));
  });

  it('passes an explicit status through', async () => {
    await boardsApi.get('board-1', 'ARCHIVED');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/boards/board-1?status=ARCHIVED',
      expect.objectContaining({}),
    );
  });
});

describe('queryKeys.boardFiltered', () => {
  it('extends the board key so existing invalidations still match', () => {
    expect(queryKeys.boardFiltered('board-1', 'ARCHIVED')).toEqual([
      ...queryKeys.board('board-1'),
      { status: 'ARCHIVED' },
    ]);
  });
});

describe('ui store status filter', () => {
  it('defaults to the active view', () => {
    expect(useUIStore.getState().statusFilter).toBe('ACTIVE');
  });

  it('records a new selection', () => {
    useUIStore.getState().setStatusFilter('COMPLETED');
    expect(useUIStore.getState().statusFilter).toBe('COMPLETED');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run tests/unit/board-status-api.test.ts`
Expected: FAIL — `queryKeys.boardFiltered` and `statusFilter` do not exist.

- [ ] **Step 3: Add the status argument to the API call**

In `apps/web/lib/api.ts`, add `TaskStatus` to the type import from `@/lib/types` and replace `boardsApi.get`:

```ts
  get: (boardId: string, status?: TaskStatus) =>
    apiFetch<Board>(
      status ? `/api/boards/${boardId}?status=${status}` : `/api/boards/${boardId}`
    ),
```

- [ ] **Step 4: Add the filtered query key and hook**

In `apps/web/lib/hooks/use-queries.ts`, add `BoardStatusFilter` to the type imports from `@/lib/types`, then add the key beneath `board`:

```ts
  board: (id: string) => ['boards', id] as const,
  /**
   * The board under a task-status filter. Deliberately an extension of
   * `board(id)`: React Query invalidates by key prefix, so every existing
   * `invalidateQueries({ queryKey: queryKeys.board(id) })` still reaches each
   * filtered variant without being touched.
   */
  boardFiltered: (id: string, status: BoardStatusFilter) =>
    ['boards', id, { status }] as const,
```

Replace `useBoard`:

```ts
export function useBoard(boardId: string, status: BoardStatusFilter = 'ACTIVE') {
  return useQuery({
    queryKey: queryKeys.boardFiltered(boardId, status),
    // ACTIVE is the server's default, so it travels as an absent param.
    queryFn: () => boardsApi.get(boardId, status === 'ACTIVE' ? undefined : status),
    enabled: !!boardId,
  });
}
```

- [ ] **Step 5: Add the store field**

In `apps/web/lib/stores/ui-store.ts`, import the type:

```ts
import type { Task, BoardStatusFilter } from '@/lib/types';
```

Add to the `UIState` interface, in the search/filter block:

```ts
  priorityFilter: string | null;
  setPriorityFilter: (priority: string | null) => void;
  statusFilter: BoardStatusFilter;
  setStatusFilter: (status: BoardStatusFilter) => void;
```

And to the store body, in the matching block:

```ts
  priorityFilter: null,
  setPriorityFilter: (priority) => set({ priorityFilter: priority }),
  statusFilter: 'ACTIVE',
  setStatusFilter: (status) => set({ statusFilter: status }),
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run tests/unit/board-status-api.test.ts`
Expected: PASS.

- [ ] **Step 7: Lint, type-check and commit**

```bash
cd /home/elx3020/collboard && npm run lint && npm run check-types
git add apps/web/lib/api.ts apps/web/lib/hooks/use-queries.ts apps/web/lib/stores/ui-store.ts apps/web/tests/unit/board-status-api.test.ts
git commit -m "feat: thread a board status filter through the client data layer

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Task card status toggle

**Files:**
- Modify: `apps/web/components/board/task-card.tsx`
- Modify: `apps/web/components/board/board-column.tsx`
- Test: `apps/web/tests/components/task-card.test.tsx` (create)

**Interfaces:**
- Consumes: `Task.status`, `TaskStatus` (Task 1); `CircleIcon`, `CheckCircleIcon`, `ArchiveIcon` (Task 3).
- Produces: `TaskCard` prop `onToggleStatus?: (task: Task) => void`; `BoardColumn` prop `onToggleStatus?: (task: Task) => void`, passed straight through. Consumed by Task 9.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/components/task-card.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { Task, TaskStatus } from '@/lib/types';

// useSortable needs a DndContext ancestor; the card's drag behaviour is not
// what these tests are about, so it is stubbed out entirely.
vi.mock('@dnd-kit/sortable', () => ({
    useSortable: () => ({
        attributes: {},
        listeners: {},
        setNodeRef: () => {},
        transform: null,
        transition: undefined,
        isDragging: false,
    }),
}));
vi.mock('@dnd-kit/utilities', () => ({
    CSS: { Transform: { toString: () => undefined } },
}));

const onClick = vi.fn();
const onToggleStatus = vi.fn();

function makeTask(status: TaskStatus): Task {
    return {
        id: 'task-1',
        title: 'Fix login',
        description: null,
        columnId: 'col-1',
        order: 0,
        assigneeId: null,
        priority: 'MEDIUM',
        status,
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
        assignee: null,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

describe('TaskCard status toggle', () => {
    it('offers to complete an incompleted task', async () => {
        const { TaskCard } = await import('@/components/board/task-card');
        render(
            <TaskCard task={makeTask('INCOMPLETED')} onClick={onClick} onToggleStatus={onToggleStatus} />
        );

        const toggle = screen.getByRole('button', { name: /mark .*complete/i });
        expect(toggle.getAttribute('aria-pressed')).toBe('false');
    });

    it('reports a completed task as pressed', async () => {
        const { TaskCard } = await import('@/components/board/task-card');
        render(
            <TaskCard task={makeTask('COMPLETED')} onClick={onClick} onToggleStatus={onToggleStatus} />
        );

        expect(
            screen.getByRole('button', { name: /mark .*complete/i }).getAttribute('aria-pressed')
        ).toBe('true');
    });

    it('toggles without opening the detail modal', async () => {
        const { TaskCard } = await import('@/components/board/task-card');
        render(
            <TaskCard task={makeTask('INCOMPLETED')} onClick={onClick} onToggleStatus={onToggleStatus} />
        );

        fireEvent.click(screen.getByRole('button', { name: /mark .*complete/i }));

        expect(onToggleStatus).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-1' }));
        expect(onClick).not.toHaveBeenCalled();
    });

    it('shows an archived task as a non-interactive indicator', async () => {
        const { TaskCard } = await import('@/components/board/task-card');
        render(
            <TaskCard task={makeTask('ARCHIVED')} onClick={onClick} onToggleStatus={onToggleStatus} />
        );

        expect(screen.queryByRole('button', { name: /mark .*complete/i })).toBeNull();
        expect(screen.getByLabelText('Archived')).toBeTruthy();
    });

    it('strikes through the title of a completed task', async () => {
        const { TaskCard } = await import('@/components/board/task-card');
        render(
            <TaskCard task={makeTask('COMPLETED')} onClick={onClick} onToggleStatus={onToggleStatus} />
        );

        expect(screen.getByText('Fix login').className).toContain('line-through');
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run tests/components/task-card.test.tsx`
Expected: FAIL — no toggle button is rendered.

- [ ] **Step 3: Add the toggle to the card**

In `apps/web/components/board/task-card.tsx`, extend the imports:

```tsx
import { PriorityBadge, Avatar } from '@/components/ui-shared';
import { CommentIcon, CircleIcon, CheckCircleIcon, ArchiveIcon } from '@/components/icons';
```

Extend the props:

```tsx
interface TaskCardProps {
    task: Task;
    onClick: () => void;
    onToggleStatus?: (task: Task) => void;
    isDragOverlay?: boolean;
}

export function TaskCard({ task, onClick, onToggleStatus, isDragOverlay }: TaskCardProps) {
```

Add the completed/archived dimming to the root `clsx` call:

```tsx
            className={clsx(
                'group cursor-grab rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 shadow-sm transition-all hover:shadow-md hover:border-[var(--accent)]',
                task.status !== 'INCOMPLETED' && 'opacity-60',
                isDragging && 'opacity-40',
                isDragOverlay && 'drag-overlay cursor-grabbing'
            )}
```

Replace the priority/comment-count row with:

```tsx
            {/* Priority + comment count + status */}
            <div className="mb-2 flex items-center justify-between">
                <PriorityBadge priority={task.priority} />
                <div className="flex items-center gap-2">
                    {task._count?.comments ? (
                        <span className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                            <CommentIcon className="h-3.5 w-3.5" />
                            {task._count.comments}
                        </span>
                    ) : null}

                    {task.status === 'ARCHIVED' ? (
                        // Archiving is a modal-only action, so on the card the glyph
                        // is an indicator rather than a control.
                        <ArchiveIcon
                            className="h-4 w-4 text-[var(--muted-foreground)]"
                            aria-hidden={undefined}
                            aria-label="Archived"
                            role="img"
                        />
                    ) : (
                        <button
                            type="button"
                            aria-label={
                                task.status === 'COMPLETED' ? 'Mark as incompleted' : 'Mark as completed'
                            }
                            aria-pressed={task.status === 'COMPLETED'}
                            // The card itself opens the modal and carries the drag
                            // listeners, so this control has to claim both gestures.
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleStatus?.(task);
                            }}
                            className="rounded text-[var(--muted-foreground)] transition-colors hover:text-[var(--accent)]"
                        >
                            {task.status === 'COMPLETED' ? (
                                <CheckCircleIcon className="h-4 w-4 text-[var(--accent)]" />
                            ) : (
                                <CircleIcon className="h-4 w-4" />
                            )}
                        </button>
                    )}
                </div>
            </div>
```

Strike through a completed title:

```tsx
            <h4
                className={clsx(
                    'text-sm font-medium text-[var(--foreground)] line-clamp-2',
                    task.status === 'COMPLETED' && 'line-through'
                )}
            >
                {task.title}
            </h4>
```

- [ ] **Step 4: Pass the callback through the column**

In `apps/web/components/board/board-column.tsx`, add to `BoardColumnProps`:

```tsx
    onTaskClick: (task: Task) => void;
    onToggleStatus?: (task: Task) => void;
```

Add `onToggleStatus` to the destructured parameters, and pass it at the `<TaskCard` call around line 148:

```tsx
                        <TaskCard
                            key={task.id}
                            task={task}
                            onClick={() => onTaskClick(task)}
                            onToggleStatus={onToggleStatus}
                        />
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run tests/components/task-card.test.tsx`
Expected: PASS, all five.

- [ ] **Step 6: Lint, type-check and commit**

```bash
cd /home/elx3020/collboard && npm run lint && npm run check-types
git add apps/web/components/board/task-card.tsx apps/web/components/board/board-column.tsx apps/web/tests/components/task-card.test.tsx
git commit -m "feat: toggle a task between completed and incompleted from its card

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Status control in the detail modal

**Files:**
- Modify: `apps/web/components/board/task-detail-modal.tsx`
- Test: `apps/web/tests/components/task-detail-modal.test.tsx` (exists — extend it)

**Interfaces:**
- Consumes: `TaskStatus` (Task 1); the three status icons (Task 3); `UpdateTaskRequest.status` (Task 1).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Write the failing test**

The file already exists and already mocks `@/lib/hooks/use-queries` with an `updateMutate` spy. Add `status: 'INCOMPLETED'` to its `task` fixture, then append these cases inside the existing `describe('TaskDetailModal', ...)`:

```tsx
    it('shows the current status as pressed', async () => {
        const { TaskDetailModal } = await import('@/components/board/task-detail-modal');
        render(<TaskDetailModal open onClose={() => {}} task={task} boardId="board-1" />);
        settleAutoFocus();

        expect(
            screen.getByRole('button', { name: 'Incompleted' }).getAttribute('aria-pressed')
        ).toBe('true');
        expect(
            screen.getByRole('button', { name: 'Completed' }).getAttribute('aria-pressed')
        ).toBe('false');
    });

    it('saves a status change on close', async () => {
        const { TaskDetailModal } = await import('@/components/board/task-detail-modal');
        render(<TaskDetailModal open onClose={() => {}} task={task} boardId="board-1" />);
        settleAutoFocus();

        fireEvent.click(screen.getByRole('button', { name: 'Archived' }));
        fireEvent.click(screen.getByLabelText('Close'));

        expect(updateMutate).toHaveBeenCalledWith({
            taskId: 'task-1',
            data: { status: 'ARCHIVED' },
        });
    });

    it('does not re-save a status that was not changed', async () => {
        const { TaskDetailModal } = await import('@/components/board/task-detail-modal');
        render(<TaskDetailModal open onClose={() => {}} task={task} boardId="board-1" />);
        settleAutoFocus();

        fireEvent.click(screen.getByRole('button', { name: 'Incompleted' }));
        fireEvent.click(screen.getByLabelText('Close'));

        expect(updateMutate).not.toHaveBeenCalled();
    });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run tests/components/task-detail-modal.test.tsx`
Expected: FAIL — no button named "Incompleted" exists.

- [ ] **Step 3: Add the control**

In `apps/web/components/board/task-detail-modal.tsx`, extend the imports:

```tsx
import { clsx } from 'clsx';
import { CircleIcon, CheckCircleIcon, ArchiveIcon } from '@/components/icons';
import type { Task, Priority, TaskStatus, UpdateTaskRequest } from '@/lib/types';
```

Add the option table above the component:

```tsx
/** The three statuses, in the order they appear in the modal. */
const STATUS_OPTIONS: { value: TaskStatus; label: string; Icon: typeof CircleIcon }[] = [
    { value: 'INCOMPLETED', label: 'Incompleted', Icon: CircleIcon },
    { value: 'COMPLETED', label: 'Completed', Icon: CheckCircleIcon },
    { value: 'ARCHIVED', label: 'Archived', Icon: ArchiveIcon },
];
```

Add the state beside the other edit fields:

```tsx
    const [editStatus, setEditStatus] = useState<TaskStatus>(task.status);
```

Add to `getChanges`, after the priority comparison:

```tsx
        if (editStatus !== task.status) changes.status = editStatus;
```

Insert the control between the `<textarea>` and the `<div className="flex flex-wrap items-center gap-3">` that holds priority:

```tsx
                    <div
                        role="group"
                        aria-label="Task status"
                        className="flex gap-2"
                    >
                        {STATUS_OPTIONS.map(({ value, label, Icon }) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => setEditStatus(value)}
                                aria-pressed={editStatus === value}
                                className={clsx(
                                    'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors',
                                    editStatus === value
                                        ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]'
                                        : 'border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--accent)]'
                                )}
                            >
                                <Icon className="h-4 w-4" />
                                {label}
                            </button>
                        ))}
                    </div>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run tests/components/task-detail-modal.test.tsx`
Expected: PASS — the three new cases plus the four focus/save cases already in the file.

- [ ] **Step 5: Lint, type-check and commit**

```bash
cd /home/elx3020/collboard && npm run lint && npm run check-types
git add apps/web/components/board/task-detail-modal.tsx apps/web/tests/components/task-detail-modal.test.tsx
git commit -m "feat: set task status from the detail modal

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Board header filter and archived deep-links

**Files:**
- Modify: `apps/web/app/boards/[boardId]/page.tsx`

**Interfaces:**
- Consumes: `useBoard(boardId, status)`, `useUIStore.statusFilter` (Task 6); `BoardColumn` prop `onToggleStatus` (Task 7); `useUpdateTask` (existing); `tasksApi.get` (existing).
- Produces: nothing consumed downstream.

This task has no unit test — the page is a `@dnd-kit` + realtime host that is not worth mounting in happy-dom. Task 11's e2e covers it end to end.

- [ ] **Step 1: Read the filter through the store and into the query**

In `apps/web/app/boards/[boardId]/page.tsx`, add `statusFilter` to the `useUIStore` destructuring at lines 55-66:

```tsx
    searchQuery,
    priorityFilter,
    statusFilter,
  } = useUIStore();
```

Then pass it to the board query at line 49:

```tsx
  const { data: board, isLoading, error } = useBoard(boardId, statusFilter);
```

- [ ] **Step 2: Add the filter control**

In the "Search + Filter + Status" toolbar block, directly after the priority `<select>`, add:

```tsx
            <select
              value={statusFilter}
              onChange={(e) =>
                useUIStore.getState().setStatusFilter(e.target.value as BoardStatusFilter)
              }
              className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none"
              aria-label="Filter by status"
            >
              <option value="ACTIVE">Active</option>
              <option value="INCOMPLETED">Incompleted</option>
              <option value="COMPLETED">Completed</option>
              <option value="ARCHIVED">Archived</option>
            </select>
```

Add `BoardStatusFilter` to the type import from `@/lib/types` at the top of the file.

- [ ] **Step 3: Wire the card toggle**

Add `useUpdateTask` to the existing import block at lines 22-28:

```tsx
import {
  useBoard,
  useCreateColumn,
  useDeleteColumn,
  useUpdateColumn,
  useMoveTask,
  useUpdateTask,
} from '@/lib/hooks/use-queries';
```

Add the mutation beside the existing `deleteColumn` / `updateColumn` hooks:

```tsx
  const updateTask = useUpdateTask(boardId);
```

Then pass the handler at the `<BoardColumn` call (line 294), after `onTaskClick`:

```tsx
                onToggleStatus={(task) =>
                  updateTask.mutate({
                    taskId: task.id,
                    data: { status: task.status === 'COMPLETED' ? 'INCOMPLETED' : 'COMPLETED' },
                  })
                }
```

- [ ] **Step 4: Make notification deep-links work for archived tasks**

The `?task=` effect resolves the task out of the board payload, which no longer contains archived tasks. Replace the effect body (currently around lines 79-91) with:

```tsx
  useEffect(() => {
    if (!requestedTaskId || !board) return;

    const task = board.columns
      ?.flatMap((column) => column.tasks ?? [])
      .find((t) => t.id === requestedTaskId);

    if (task) {
      openTaskModal(task);
      router.replace(`/boards/${board.id}`, { scroll: false });
      return;
    }

    // Not in the payload: the board is filtered and this task is archived or
    // otherwise excluded. The single-task endpoint ignores status, so fetch it
    // directly rather than leaving the notification link dead.
    let cancelled = false;

    tasksApi
      .get(board.id, requestedTaskId)
      .then((fetched) => {
        if (!cancelled) openTaskModal(fetched);
      })
      .catch(() => {
        // A deleted task, or one the viewer cannot see. Nothing to open.
      })
      .finally(() => {
        if (!cancelled) router.replace(`/boards/${board.id}`, { scroll: false });
      });

    return () => {
      cancelled = true;
    };
  }, [requestedTaskId, board, openTaskModal, router]);
```

Import `tasksApi` from `@/lib/api` at the top of the file.

- [ ] **Step 5: Verify the whole suite, lint and types**

Run: `cd /home/elx3020/collboard && npm run lint && npm run check-types && cd apps/web && npx vitest run`
Expected: PASS everywhere.

- [ ] **Step 6: Manual smoke check**

Run `npm run dev` from the repo root, open a board, and confirm: the check icon toggles and the card dims and strikes through; the header filter switches between Active / Incompleted / Completed / Archived; archiving from the modal removes the card from the Active view and it reappears under Archived.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/boards/[boardId]/page.tsx"
git commit -m "feat: filter the board by task status and keep archived deep-links alive

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Status icon in the notification feed, and its setting

**Files:**
- Modify: `apps/web/components/notifications/notification-item.tsx`
- Modify: `apps/web/components/settings/notification-toggles.tsx`
- Test: `apps/web/tests/components/notification-item.test.tsx` (create)

**Interfaces:**
- Consumes: `TASK_STATUS_CHANGED`, `NotificationMeta.status` (Task 1); the status icons (Task 3); `formatNotification` (Task 2).
- Produces: nothing consumed downstream.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/components/notification-item.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { NotificationItem } from '@/components/notifications/notification-item';
import type { AppNotification, NotificationType, NotificationMeta } from '@/lib/types';

function make(type: NotificationType, meta: NotificationMeta | null = null): AppNotification {
    return {
        id: 'n-1',
        type,
        actorId: 'user-2',
        boardId: 'board-1',
        taskId: 'task-1',
        actorName: 'Ada',
        boardTitle: 'Roadmap',
        taskTitle: 'Fix login',
        meta,
        readAt: null,
        createdAt: '2026-09-03T12:00:00.000Z',
        actor: null,
    };
}

describe('NotificationItem status icon', () => {
    it('marks a completion with the completed glyph', () => {
        render(
            <NotificationItem
                notification={make('TASK_STATUS_CHANGED', { status: 'COMPLETED' })}
                onSelect={vi.fn()}
            />
        );

        expect(screen.getByLabelText('Completed')).toBeTruthy();
        expect(screen.getByText('Ada completed Fix login')).toBeTruthy();
    });

    it('marks an archive with the archived glyph', () => {
        render(
            <NotificationItem
                notification={make('TASK_STATUS_CHANGED', { status: 'ARCHIVED' })}
                onSelect={vi.fn()}
            />
        );

        expect(screen.getByLabelText('Archived')).toBeTruthy();
    });

    it('shows no status glyph on other notification types', () => {
        render(<NotificationItem notification={make('TASK_ASSIGNED')} onSelect={vi.fn()} />);

        expect(screen.queryByLabelText('Completed')).toBeNull();
        expect(screen.queryByLabelText('Incompleted')).toBeNull();
        expect(screen.queryByLabelText('Archived')).toBeNull();
    });

    it('shows no status glyph when meta is missing', () => {
        render(
            <NotificationItem notification={make('TASK_STATUS_CHANGED', null)} onSelect={vi.fn()} />
        );

        expect(screen.queryByLabelText('Completed')).toBeNull();
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && npx vitest run tests/components/notification-item.test.tsx`
Expected: FAIL — no element is labelled "Completed".

- [ ] **Step 3: Render the glyph**

In `apps/web/components/notifications/notification-item.tsx`, extend the imports:

```tsx
import { CircleIcon, CheckCircleIcon, ArchiveIcon } from '@/components/icons';
import type { AppNotification, TaskStatus } from '@/lib/types';
```

Add above the component:

```tsx
/** The glyph and its announced name for each status a notification can carry. */
const STATUS_GLYPH: Record<TaskStatus, { Icon: typeof CircleIcon; label: string }> = {
    INCOMPLETED: { Icon: CircleIcon, label: 'Incompleted' },
    COMPLETED: { Icon: CheckCircleIcon, label: 'Completed' },
    ARCHIVED: { Icon: ArchiveIcon, label: 'Archived' },
};
```

Inside the component, above the `return`:

```tsx
    // Only status changes carry a status; every other type renders as before.
    const glyph =
        notification.type === 'TASK_STATUS_CHANGED' && notification.meta?.status
            ? STATUS_GLYPH[notification.meta.status]
            : null;
```

Insert between the `<Avatar ... />` and the `<span className="min-w-0 flex-1">`:

```tsx
            {glyph && (
                <glyph.Icon
                    className="mt-0.5 h-4 w-4 shrink-0 text-[var(--muted-foreground)]"
                    aria-hidden={undefined}
                    aria-label={glyph.label}
                    role="img"
                />
            )}
```

- [ ] **Step 4: Add the preference switch**

In `apps/web/components/settings/notification-toggles.tsx`, append to the `SETTINGS` array, after the `BOARD_TASK_REMOVED` entry:

```tsx
    {
        type: 'TASK_STATUS_CHANGED',
        label: 'Status changes on your tasks',
        hint: 'Tasks you are assigned to or have commented on.',
    },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/components/notification-item.test.tsx tests/components/notification-toggles.test.tsx`
Expected: PASS, both files.

- [ ] **Step 6: Lint, type-check and commit**

```bash
cd /home/elx3020/collboard && npm run lint && npm run check-types
git add apps/web/components/notifications/notification-item.tsx apps/web/components/settings/notification-toggles.tsx apps/web/tests/components/notification-item.test.tsx
git commit -m "feat: show the new status as an icon in the notification feed

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: End-to-end status round trip

**Files:**
- Create: `apps/web/tests/e2e/task-status.spec.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [ ] **Step 1: Install the browser if it is not already present**

Browsers are not downloaded on install (`.npmrc` sets `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`).

Run: `npx playwright install --with-deps chromium`

- [ ] **Step 2: Write the spec**

Create `apps/web/tests/e2e/task-status.spec.ts`. Board, column and task setup goes through the API using the page context's own session cookies, matching `tests/e2e/task-assignee.spec.ts` — clicking through setup would make the test fragile for no extra coverage.

```ts
import { test, expect, type Page } from '@playwright/test';

/**
 * E2E: a task's status from the card, through the filter, to the archive.
 *
 * The status is the one task field that changes without opening anything, so
 * this walks the card toggle, a reload, the header filter and the modal's
 * archive in one pass.
 */

const PASSWORD = 'CorrectHorse1!';

async function register(page: Page, email: string, name: string) {
  await page.goto('/auth/signup');
  await page.getByLabel(/name/i).fill(name);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByLabel(/confirm password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();

  if (page.url().includes('/auth/signin')) {
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();
  }
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}

test('completes, filters, and archives a task', async ({ page }) => {
  const stamp = Date.now();
  const title = `Status round trip ${stamp}`;

  await register(page, `status-${stamp}@example.com`, 'Ada');

  // ── Setup via API ──
  const board = await (
    await page.request.post('/api/boards', { data: { title: `Roadmap ${stamp}` } })
  ).json();
  const column = await (
    await page.request.post(`/api/boards/${board.id}/columns`, { data: { title: 'To Do' } })
  ).json();
  const task = await (
    await page.request.post(`/api/boards/${board.id}/tasks`, {
      data: { title, columnId: column.id },
    })
  ).json();
  expect(task.status).toBe('INCOMPLETED'); // the default

  await page.goto(`/boards/${board.id}`);

  const card = page.getByRole('button', { name: new RegExp(`Task: ${title}`) });
  await expect(card).toBeVisible();

  // ── Complete it from the card ──
  const saved = page.waitForResponse(
    (r) => r.url().includes(`/tasks/${task.id}`) && r.request().method() === 'PATCH' && r.ok(),
  );
  await card.getByRole('button', { name: 'Mark as completed' }).click();
  await saved;

  // Survives a reload, so it really was persisted.
  await page.reload();
  await expect(
    page
      .getByRole('button', { name: new RegExp(`Task: ${title}`) })
      .getByRole('button', { name: 'Mark as incompleted' }),
  ).toBeVisible();

  // ── Filter ──
  const statusFilter = page.getByLabel('Filter by status');
  await statusFilter.selectOption('INCOMPLETED');
  await expect(page.getByText(title)).toHaveCount(0);

  await statusFilter.selectOption('COMPLETED');
  await expect(page.getByText(title)).toBeVisible();

  // ── Archive from the modal ──
  await statusFilter.selectOption('ACTIVE');
  await page.getByRole('button', { name: new RegExp(`Task: ${title}`) }).click();

  const archived = page.waitForResponse(
    (r) => r.url().includes(`/tasks/${task.id}`) && r.request().method() === 'PATCH' && r.ok(),
  );
  await page.getByRole('button', { name: 'Archived' }).click();
  await page.getByLabel('Close').click(); // the detail modal saves on close
  await archived;

  // Gone from the default view, present under the archived filter.
  await expect(page.getByText(title)).toHaveCount(0);
  await statusFilter.selectOption('ARCHIVED');
  await expect(page.getByText(title)).toBeVisible();
});
```

- [ ] **Step 3: Run the e2e suite**

Run: `cd /home/elx3020/collboard && npm run test:e2e -- task-status.spec.ts`
Expected: PASS. The root config boots the dev server itself; Postgres and Redis must already be up.

- [ ] **Step 4: Full verification**

Run: `cd /home/elx3020/collboard && npm run lint && npm run check-types && npm run test`
Expected: PASS everywhere.

- [ ] **Step 5: Commit**

```bash
git add apps/web/tests/e2e/task-status.spec.ts
git commit -m "test: cover the task status round trip end to end

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```
