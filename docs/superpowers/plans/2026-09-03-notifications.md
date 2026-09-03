# Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every user a real-time notification feed — a navbar bell with a dropdown of the 5 most recent notifications, load-more paging, per-click read tracking, and automatic collection at the end of the calendar week in which a notification was read.

**Architecture:** A `Notification` row per recipient, written by a single `notify()` entry point in `lib/notifications/` so no API route assembles its own fan-out. Delivery rides a **new user-scoped Redis channel** (`user:<userId>`) and a matching `userRooms` map in `ws-server`, because the existing bus is board-scoped and cannot reach a user sitting on the dashboard. Clients never patch from the event — they invalidate the React Query key and refetch, matching every other real-time path in this app.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query v5 (`useInfiniteQuery`), Zustand, Prisma 7 + Postgres (driver adapter over `pg`), ioredis pub/sub, `ws`, `@headlessui/react`, Tailwind v4 CSS-variable tokens, Vitest (node + happy-dom).

**Spec:** `docs/superpowers/specs/2026-09-03-notifications-design.md` — read it before starting. It carries the rationale for every decision below, including the three most likely to look wrong at first glance (targets are not foreign keys, `deleteAt` is nullable, `TASK_MOVED` is deliberately absent).

## Global Constraints

- Every task runs from `/home/elx3020/collboard/apps/web` unless stated otherwise.
- **Prisma Client must be generated before lint / type-check / build will pass:** `npx prisma generate`.
- Lint is `--max-warnings 0` and `eslint-plugin-only-warn` downgrades errors to warnings, so **any** lint finding fails the build.
- Server-side logging goes through `lib/logger.ts` (pino), never `console`. (`ws-server.ts` carries a file-level `//@lint-ignore-file no-console` and still uses `logger` — follow the `logger` calls around you.)
- `@/*` maps to `apps/web/*`.
- Vitest defaults to the `node` environment; component tests opt in with `// @vitest-environment happy-dom` on **line 1**.
- Integration tests mock `@/lib/prisma` and `next-auth/next` rather than hitting a database.
- **Indentation is not uniform.** `lib/`, `app/api/`, `app/boards/[boardId]/page.tsx`, and `tests/unit|integration/` use 2 spaces. `components/`, `app/dashboard/page.tsx`, and `tests/components/` use 4 spaces. Match the file you are editing; the code blocks below are already indented for their target file.
- All colours come from CSS variables (`var(--foreground)`, `var(--card)`, `var(--accent)`, `var(--muted-foreground)`, `var(--border)`, `var(--destructive)`). Never hardcode a hex or a Tailwind palette colour in a component.
- Icons live in `components/icons/`, one file per glyph, re-exported from the barrel. Never inline an `<svg>` in a feature component.
- Adding a real-time event means touching four places: `EventType` + payload type in `lib/types.ts`, the publish call, the `on(...)` wiring in a hook, and the consumer's callback.
- Local infra must be up for anything touching the database: `docker compose up -d` from the repo root (Compose v2 — there is no `docker-compose` binary on this machine). Postgres 5432 (user/db `collboard`), Redis 6379.

## Naming note

The DOM has a global `Notification` type. The app-level interface is therefore called **`AppNotification`** everywhere in TypeScript. The Prisma model is still `Notification` (it lives in its own namespace). Do not "fix" this inconsistency — it is deliberate.

## File Structure

**Create:**
- `lib/utils/relative-time.ts` — `formatRelativeTime`. Pure, no imports.
- `lib/utils/end-of-week.ts` — `endOfIsoWeek`. Pure, no imports.
- `lib/notifications/format.ts` — notification → display string. Pure.
- `lib/notifications/recipients.ts` — event → recipient user ids. The only place fan-out lives.
- `lib/notifications/notify.ts` — write rows + publish. The only entry point routes call.
- `lib/notifications/sweep.ts` — `sweepExpiredNotifications`. Called by `ws-server`.
- `lib/hooks/use-user-realtime.tsx` — subscribes to the user's notification stream.
- `app/api/notifications/route.ts` — GET feed.
- `app/api/notifications/[id]/read/route.ts` — PATCH mark one read.
- `app/api/notifications/read-all/route.ts` — PATCH mark all read.
- `components/icons/bell-icon.tsx` — `BellIcon`.
- `components/notifications/notification-bell.tsx` — trigger, badge, dropdown.
- `components/notifications/notification-item.tsx` — one row.
- `tests/unit/relative-time.test.ts`, `tests/unit/end-of-week.test.ts`, `tests/unit/notification-format.test.ts`, `tests/unit/notification-recipients.test.ts`, `tests/unit/notification-sweep.test.ts`
- `tests/integration/notification-routes.test.ts`
- `tests/components/notification-bell.test.tsx`

**Modify:**
- `prisma/schema.prisma` — `Notification` model, `NotificationType` enum, two `User` relations.
- `lib/types.ts` — `EventType.NOTIFICATION_CREATED`, `CHANNELS.USER`, `AppNotification`, `NotificationPage`, `NotificationCreatedPayload`, `WsServerEventMap` entry.
- `lib/api.ts` — `notificationsApi`.
- `lib/hooks/use-queries.ts` — `queryKeys.notifications` + three hooks.
- `components/icons/index.ts` — export `BellIcon`.
- `components/navbar.tsx` — render `<NotificationBell />`.
- `ws-server.ts` — `userRooms`, `user:*` subscription, daily sweep.
- `app/api/boards/[boardId]/tasks/route.ts` — publish `task:created`; notify on create.
- `app/api/boards/[boardId]/tasks/[taskId]/route.ts` — publish `task:updated` / `task:deleted`; notify on assign and delete.
- `app/api/boards/[boardId]/tasks/[taskId]/comments/route.ts` — notify on comment.
- `app/api/boards/[boardId]/tasks/[taskId]/comments/[commentId]/route.ts` — publish `comment:updated` / `comment:deleted`.
- `app/api/boards/[boardId]/members/route.ts` — notify on invite.
- `app/api/boards/[boardId]/members/[memberId]/route.ts` — notify on role change.
- `app/boards/[boardId]/page.tsx` — `?task=<id>` deep link.

## The two event families

Two different things travel over the same socket. Do not conflate them:

| | `EventType` (sync) | `NotificationType` (notice) |
|---|---|---|
| Answers | "the board changed, redraw" | "someone needs your attention" |
| Channel | `board:<boardId>` | `user:<userId>` |
| Audience | everyone viewing that board, **including the actor's own other tabs** | one member, never the actor |
| Lifetime | fire and forget | a row that persists until read and swept |

Sync events are broadcast to the actor too — their other tabs need the update as
much as anyone else's. Notifications always exclude the actor.

Their members previously collided (`EventType.TASK_CREATED` vs a notification
type of the same name). The notification types are now named for the notice:
`TASK_COMMENTED`, `BOARD_TASK_ADDED`, `BOARD_TASK_REMOVED`. `TASK_ASSIGNED`,
`BOARD_INVITED` and `BOARD_ROLE_CHANGED` never collided and are unchanged.

`EventType` declares nine events and `use-board-realtime.tsx` wires callbacks for
all of them, but only `task:moved` and `comment:added` are ever published — the
rest are dead wiring, which is why a second tab does not currently see a task
appear or disappear. **Task 10 fixes that**, since it is the same routes being
touched.

---

### Task 1: Schema and migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_notifications/migration.sql` (generated)

**Interfaces:**
- Consumes: nothing.
- Produces: `prisma.notification` delegate with fields `id, userId, type, actorId, boardId, taskId, actorName, boardTitle, taskTitle, meta, readAt, deleteAt, createdAt` and relation `actor`. Enum `NotificationType` with members `TASK_ASSIGNED | TASK_COMMENTED | BOARD_INVITED | BOARD_ROLE_CHANGED | BOARD_TASK_ADDED | BOARD_TASK_REMOVED`.

- [ ] **Step 1: Confirm local infra is running**

```bash
cd /home/elx3020/collboard && docker compose up -d && cd apps/web
```

Expected: Postgres and Redis containers up. If `docker-compose` reports them already running, that is fine.

- [ ] **Step 2: Add the enum and model to `prisma/schema.prisma`**

Append to the end of the file, after the existing `Priority` enum:

```prisma
// Notification model - one row per recipient per event
model Notification {
  id         String           @id @default(cuid())
  userId     String
  type       NotificationType
  actorId    String?

  // Targets are plain columns, NOT foreign keys: a cascade from Task would
  // delete the very notification announcing that task's deletion.
  boardId    String?
  taskId     String?

  // Display snapshots, so a notification outlives its subject
  actorName  String?
  boardTitle String?
  taskTitle  String?
  meta       Json?

  readAt     DateTime?
  deleteAt   DateTime?
  createdAt  DateTime         @default(now())

  user  User  @relation("NotificationRecipient", fields: [userId], references: [id], onDelete: Cascade)
  actor User? @relation("NotificationActor", fields: [actorId], references: [id], onDelete: SetNull)

  @@index([userId, createdAt(sort: Desc)])
  @@index([userId, readAt])
  @@index([deleteAt])
}

enum NotificationType {
  TASK_ASSIGNED
  TASK_COMMENTED
  BOARD_INVITED
  BOARD_ROLE_CHANGED
  BOARD_TASK_ADDED
  BOARD_TASK_REMOVED
}
```

- [ ] **Step 3: Add the two relation fields to `User`**

In the `User` model, inside the `// App relations` block, after `refreshTokens RefreshToken[]`:

```prisma
  notifications      Notification[] @relation("NotificationRecipient")
  notificationsActed Notification[] @relation("NotificationActor")
```

- [ ] **Step 4: Create and apply the migration**

Run: `npx prisma migrate dev --name add_notifications`
Expected: a new folder under `prisma/migrations/`, and "Your database is now in sync with your schema."

- [ ] **Step 5: Verify the generated SQL**

Run: `cat prisma/migrations/*_add_notifications/migration.sql`
Expected: `CREATE TYPE "NotificationType"`, `CREATE TABLE "Notification"`, three `CREATE INDEX` statements, and **two** `ALTER TABLE ... ADD CONSTRAINT` lines (for `userId` and `actorId` only). If you see a foreign key on `boardId` or `taskId`, the schema is wrong — those must be plain columns.

- [ ] **Step 6: Regenerate the client and type-check**

Run: `npx prisma generate && npm run check-types`
Expected: both succeed with no output errors.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add Notification model and migration"
```

---

### Task 2: Time utilities

Two pure functions with no dependencies: one formats a notification's age for display, the other computes the retention deadline.

**Files:**
- Create: `lib/utils/relative-time.ts`, `lib/utils/end-of-week.ts`
- Test: `tests/unit/relative-time.test.ts`, `tests/unit/end-of-week.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `formatRelativeTime(iso: string, now?: Date): string` — `"45s"`, `"5m"`, `"2h"`, `"4d"`.
  - `endOfIsoWeek(at: Date): Date` — Sunday 23:59:59.999 UTC of the week containing `at`.

- [ ] **Step 1: Write the failing tests for `formatRelativeTime`**

Create `tests/unit/relative-time.test.ts` (2-space indent):

```ts
import { describe, it, expect } from 'vitest';
import { formatRelativeTime } from '@/lib/utils/relative-time';

const NOW = new Date('2026-09-03T12:00:00.000Z');

/** `secondsAgo` before NOW, as an ISO string. */
function ago(secondsAgo: number): string {
  return new Date(NOW.getTime() - secondsAgo * 1000).toISOString();
}

describe('formatRelativeTime', () => {
  it('reports whole seconds under a minute', () => {
    expect(formatRelativeTime(ago(0), NOW)).toBe('0s');
    expect(formatRelativeTime(ago(45), NOW)).toBe('45s');
    expect(formatRelativeTime(ago(59), NOW)).toBe('59s');
  });

  it('switches to minutes at exactly one minute', () => {
    expect(formatRelativeTime(ago(60), NOW)).toBe('1m');
    expect(formatRelativeTime(ago(3599), NOW)).toBe('59m');
  });

  it('switches to hours at exactly one hour', () => {
    expect(formatRelativeTime(ago(3600), NOW)).toBe('1h');
    expect(formatRelativeTime(ago(86_399), NOW)).toBe('23h');
  });

  it('switches to days at exactly one day and does not cap', () => {
    expect(formatRelativeTime(ago(86_400), NOW)).toBe('1d');
    expect(formatRelativeTime(ago(86_400 * 45), NOW)).toBe('45d');
  });

  it('clamps future timestamps to 0s rather than printing a negative', () => {
    expect(formatRelativeTime(ago(-30), NOW)).toBe('0s');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/relative-time.test.ts`
Expected: FAIL — cannot resolve `@/lib/utils/relative-time`.

- [ ] **Step 3: Implement `formatRelativeTime`**

Create `lib/utils/relative-time.ts` (2-space indent):

```ts
const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Compact age of a timestamp: `45s`, `5m`, `2h`, `4d`.
 *
 * Days are the largest unit and are not capped — an unread notification never
 * expires, so `45d` is a legitimate result. Future timestamps (clock skew
 * between server and browser) clamp to `0s` rather than printing a negative.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const seconds = Math.floor((now.getTime() - new Date(iso).getTime()) / 1000);

  if (seconds < MINUTE) return `${Math.max(seconds, 0)}s`;
  if (seconds < HOUR) return `${Math.floor(seconds / MINUTE)}m`;
  if (seconds < DAY) return `${Math.floor(seconds / HOUR)}h`;
  return `${Math.floor(seconds / DAY)}d`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/relative-time.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the failing tests for `endOfIsoWeek`**

Create `tests/unit/end-of-week.test.ts` (2-space indent). The reference week is Monday 2026-09-07 through Sunday 2026-09-13:

```ts
import { describe, it, expect } from 'vitest';
import { endOfIsoWeek } from '@/lib/utils/end-of-week';

describe('endOfIsoWeek', () => {
  it('rolls a Monday forward to the Sunday that ends its week', () => {
    const result = endOfIsoWeek(new Date('2026-09-07T09:15:00.000Z'));
    expect(result.toISOString()).toBe('2026-09-13T23:59:59.999Z');
  });

  it('rolls a midweek day forward to the same Sunday', () => {
    const result = endOfIsoWeek(new Date('2026-09-09T23:00:00.000Z'));
    expect(result.toISOString()).toBe('2026-09-13T23:59:59.999Z');
  });

  it('rolls a Saturday forward by one day', () => {
    const result = endOfIsoWeek(new Date('2026-09-12T00:00:00.000Z'));
    expect(result.toISOString()).toBe('2026-09-13T23:59:59.999Z');
  });

  it('keeps a Sunday in its own week rather than adding seven days', () => {
    const result = endOfIsoWeek(new Date('2026-09-13T00:00:01.000Z'));
    expect(result.toISOString()).toBe('2026-09-13T23:59:59.999Z');
  });

  it('treats the previous Sunday as ending the previous week', () => {
    const result = endOfIsoWeek(new Date('2026-09-06T18:00:00.000Z'));
    expect(result.toISOString()).toBe('2026-09-06T23:59:59.999Z');
  });

  it('does not mutate its argument', () => {
    const input = new Date('2026-09-07T09:15:00.000Z');
    endOfIsoWeek(input);
    expect(input.toISOString()).toBe('2026-09-07T09:15:00.000Z');
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npx vitest run tests/unit/end-of-week.test.ts`
Expected: FAIL — cannot resolve `@/lib/utils/end-of-week`.

- [ ] **Step 7: Implement `endOfIsoWeek`**

Create `lib/utils/end-of-week.ts` (2-space indent):

```ts
/**
 * End of the ISO week (Sunday 23:59:59.999 UTC) containing `at`.
 *
 * ISO-8601 weeks run Monday to Sunday. UTC throughout, matching the server
 * clock. A consequence worth knowing: a notification read on Sunday evening
 * lives only hours, while one read Monday morning lives nearly seven days.
 * That is inherent to calendar-week retention, not a defect.
 */
export function endOfIsoWeek(at: Date): Date {
  const d = new Date(at.getTime());
  const day = d.getUTCDay(); // 0 = Sunday … 6 = Saturday

  d.setUTCDate(d.getUTCDate() + (day === 0 ? 0 : 7 - day));
  d.setUTCHours(23, 59, 59, 999);

  return d;
}
```

- [ ] **Step 8: Run both test files**

Run: `npx vitest run tests/unit/relative-time.test.ts tests/unit/end-of-week.test.ts`
Expected: PASS, 11 tests total.

- [ ] **Step 9: Commit**

```bash
git add lib/utils/relative-time.ts lib/utils/end-of-week.ts tests/unit/relative-time.test.ts tests/unit/end-of-week.test.ts
git commit -m "feat: add relative time and ISO week-end utilities"
```

---

### Task 3: Shared notification types

Types land before the code that uses them so every later task compiles against one definition.

**Files:**
- Modify: `lib/types.ts`

**Interfaces:**
- Consumes: existing `UserSummary`, `Role`, `EventType`, `CHANNELS`, `WsServerEventMap`.
- Produces: `NotificationType`, `NotificationMeta`, `AppNotification`, `NotificationPage`, `NotificationCreatedPayload`, `EventType.NOTIFICATION_CREATED`, `CHANNELS.USER`.

- [ ] **Step 1: Add the event type and channel**

In `lib/types.ts`, add to the `EventType` enum after `USER_LEFT`:

```ts
  NOTIFICATION_CREATED = 'notification:created',
```

And add to `CHANNELS`, after the `BOARD` entry:

```ts
  /** Per-user channel. ws-server psubscribes 'user:*' and routes to that user's sockets. */
  USER: (userId: string) => `user:${userId}`,
```

- [ ] **Step 2: Add the notification types**

Add to `lib/types.ts` in the "Shared Types" section, after the `Comment` interface:

```ts
export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'TASK_COMMENTED'
  | 'BOARD_INVITED'
  | 'BOARD_ROLE_CHANGED'
  | 'BOARD_TASK_ADDED'
  | 'BOARD_TASK_REMOVED';

/**
 * Type-specific extras. Only BOARD_ROLE_CHANGED uses one today.
 *
 * A type alias rather than an interface on purpose: Prisma's `InputJsonValue`
 * requires an implicit index signature, which TypeScript grants to aliases but
 * not to interfaces. As an interface this fails to assign in `notify()`.
 */
export type NotificationMeta = {
  role?: Role;
};

/**
 * Named `AppNotification` because `Notification` is a DOM global — shadowing it
 * inside a client component is a real source of confusion. The Prisma model is
 * still called `Notification`.
 */
export interface AppNotification {
  id: string;
  type: NotificationType;
  actorId: string | null;
  boardId: string | null;
  taskId: string | null;
  actorName: string | null;
  boardTitle: string | null;
  taskTitle: string | null;
  meta: NotificationMeta | null;
  readAt: string | null;
  createdAt: string;
  actor: UserSummary | null;
}

/** One page of GET /api/notifications. */
export interface NotificationPage {
  items: AppNotification[];
  nextCursor: string | null;
  unreadCount: number;
}

export interface NotificationCreatedPayload {
  notification: AppNotification;
}
```

- [ ] **Step 3: Add the event-map entry**

In `WsServerEventMap`, after the `USER_LEFT` entry:

```ts
  [EventType.NOTIFICATION_CREATED]: NotificationCreatedPayload;
```

- [ ] **Step 4: Type-check**

Run: `npm run check-types`
Expected: PASS. `WsServerMessage` is derived from `WsServerEventMap`, so the new event flows into it automatically.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add notification types and user channel"
```

---

### Task 4: Message formatting

Pure function, no database. Message text is built at render time and never stored — storing it would freeze wording at write time and make any copy change a migration.

**Files:**
- Create: `lib/notifications/format.ts`
- Test: `tests/unit/notification-format.test.ts`

**Interfaces:**
- Consumes: `AppNotification` from Task 3.
- Produces: `formatNotification(n: AppNotification): string`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/notification-format.test.ts` (2-space indent):

```ts
import { describe, it, expect } from 'vitest';
import { formatNotification } from '@/lib/notifications/format';
import type { AppNotification, NotificationType } from '@/lib/types';

function make(
  type: NotificationType,
  overrides: Partial<AppNotification> = {},
): AppNotification {
  return {
    id: 'n-1',
    type,
    actorId: 'user-2',
    boardId: 'board-1',
    taskId: 'task-1',
    actorName: 'Ada',
    boardTitle: 'Roadmap',
    taskTitle: 'Fix login',
    meta: null,
    readAt: null,
    createdAt: '2026-09-03T12:00:00.000Z',
    actor: null,
    ...overrides,
  };
}

describe('formatNotification', () => {
  it('describes a task assignment', () => {
    expect(formatNotification(make('TASK_ASSIGNED'))).toBe('Ada assigned you to Fix login');
  });

  it('describes a comment', () => {
    expect(formatNotification(make('TASK_COMMENTED'))).toBe('Ada commented on Fix login');
  });

  it('describes a board invite', () => {
    expect(formatNotification(make('BOARD_INVITED'))).toBe('Ada added you to Roadmap');
  });

  it('describes a role change using meta.role', () => {
    const n = make('BOARD_ROLE_CHANGED', { meta: { role: 'EDITOR' } });
    expect(formatNotification(n)).toBe('Ada changed your role on Roadmap to EDITOR');
  });

  it('describes task creation and deletion', () => {
    expect(formatNotification(make('BOARD_TASK_ADDED'))).toBe('Ada created Fix login in Roadmap');
    expect(formatNotification(make('BOARD_TASK_REMOVED'))).toBe('Ada deleted Fix login in Roadmap');
  });

  it('falls back when the actor has been deleted', () => {
    const n = make('TASK_COMMENTED', { actorId: null, actorName: null });
    expect(formatNotification(n)).toBe('Someone commented on Fix login');
  });

  it('falls back when a snapshot title is missing', () => {
    const n = make('BOARD_TASK_ADDED', { taskTitle: null, boardTitle: null });
    expect(formatNotification(n)).toBe('Ada created a task in a board');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/notification-format.test.ts`
Expected: FAIL — cannot resolve `@/lib/notifications/format`.

- [ ] **Step 3: Implement `formatNotification`**

Create `lib/notifications/format.ts` (2-space indent):

```ts
import type { AppNotification } from '@/lib/types';

/**
 * Builds a notification's display string from its type and snapshot columns.
 *
 * Never stored: rendering at display time keeps wording changeable without a
 * migration. Every field can be null — the subject may have been deleted, or
 * the actor's account removed — so each has a fallback.
 */
export function formatNotification(n: AppNotification): string {
  const actor = n.actorName ?? 'Someone';
  const task = n.taskTitle ?? 'a task';
  const board = n.boardTitle ?? 'a board';

  switch (n.type) {
    case 'TASK_ASSIGNED':
      return `${actor} assigned you to ${task}`;
    case 'TASK_COMMENTED':
      return `${actor} commented on ${task}`;
    case 'BOARD_INVITED':
      return `${actor} added you to ${board}`;
    case 'BOARD_ROLE_CHANGED':
      return `${actor} changed your role on ${board} to ${n.meta?.role ?? 'a new role'}`;
    case 'BOARD_TASK_ADDED':
      return `${actor} created ${task} in ${board}`;
    case 'BOARD_TASK_REMOVED':
      return `${actor} deleted ${task} in ${board}`;
  }
}
```

The switch has no `default`. That is intentional: with `NotificationType` as a union and the function returning `string`, TypeScript flags a missing case as an error, so adding a type later cannot silently ship without copy.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/notification-format.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/format.ts tests/unit/notification-format.test.ts
git commit -m "feat: add notification message formatting"
```

---

### Task 5: Recipient resolution

The only place fan-out rules live. Gets its own task because it is the privacy-relevant half of the feature: a bug here sends someone else's notification to the wrong person.

**Files:**
- Create: `lib/notifications/recipients.ts`
- Test: `tests/unit/notification-recipients.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/prisma`.
- Produces:
  - `type NotifyEvent` — the discriminated union below.
  - `resolveRecipients(event: NotifyEvent, actorId: string): Promise<string[]>`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/notification-recipients.test.ts` (2-space indent):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = {
  board: { findUnique: vi.fn() },
  task: { findUnique: vi.fn() },
  comment: { findMany: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

const { resolveRecipients } = await import('@/lib/notifications/recipients');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resolveRecipients', () => {
  it('notifies the assignee on TASK_ASSIGNED', async () => {
    const result = await resolveRecipients(
      { type: 'TASK_ASSIGNED', assigneeId: 'user-2' },
      'user-1',
    );
    expect(result).toEqual(['user-2']);
  });

  it('returns nobody when a user assigns a task to themselves', async () => {
    const result = await resolveRecipients(
      { type: 'TASK_ASSIGNED', assigneeId: 'user-1' },
      'user-1',
    );
    expect(result).toEqual([]);
  });

  it('returns nobody when a task is unassigned', async () => {
    const result = await resolveRecipients(
      { type: 'TASK_ASSIGNED', assigneeId: null },
      'user-1',
    );
    expect(result).toEqual([]);
  });

  it('notifies the assignee and prior commenters on COMMENT_ADDED, deduplicated', async () => {
    mockPrisma.task.findUnique.mockResolvedValue({ assigneeId: 'user-2' });
    mockPrisma.comment.findMany.mockResolvedValue([
      { userId: 'user-2' },
      { userId: 'user-3' },
      { userId: 'user-3' },
    ]);

    const result = await resolveRecipients({ type: 'TASK_COMMENTED', taskId: 'task-1' }, 'user-1');

    expect(result.sort()).toEqual(['user-2', 'user-3']);
  });

  it('never notifies the comment author, even if they are the assignee', async () => {
    mockPrisma.task.findUnique.mockResolvedValue({ assigneeId: 'user-1' });
    mockPrisma.comment.findMany.mockResolvedValue([{ userId: 'user-1' }]);

    const result = await resolveRecipients({ type: 'TASK_COMMENTED', taskId: 'task-1' }, 'user-1');

    expect(result).toEqual([]);
  });

  it('notifies the target user on BOARD_INVITED', async () => {
    const result = await resolveRecipients(
      { type: 'BOARD_INVITED', targetUserId: 'user-9' },
      'user-1',
    );
    expect(result).toEqual(['user-9']);
  });

  it('notifies owner and members on board activity, excluding the actor', async () => {
    mockPrisma.board.findUnique.mockResolvedValue({
      ownerId: 'user-1',
      members: [{ userId: 'user-2' }, { userId: 'user-3' }],
    });

    const result = await resolveRecipients({ type: 'BOARD_TASK_ADDED', boardId: 'board-1' }, 'user-1');

    expect(result.sort()).toEqual(['user-2', 'user-3']);
  });

  it('returns nobody when the board is gone', async () => {
    mockPrisma.board.findUnique.mockResolvedValue(null);

    const result = await resolveRecipients({ type: 'BOARD_TASK_REMOVED', boardId: 'board-1' }, 'user-1');

    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/notification-recipients.test.ts`
Expected: FAIL — cannot resolve `@/lib/notifications/recipients`.

- [ ] **Step 3: Implement `resolveRecipients`**

Create `lib/notifications/recipients.ts` (2-space indent):

```ts
import { prisma } from '@/lib/prisma';

/** The events that produce notifications. TASK_MOVED is deliberately absent — see the spec. */
export type NotifyEvent =
  | { type: 'TASK_ASSIGNED'; assigneeId: string | null }
  | { type: 'TASK_COMMENTED'; taskId: string }
  | { type: 'BOARD_INVITED'; targetUserId: string }
  | { type: 'BOARD_ROLE_CHANGED'; targetUserId: string }
  | { type: 'BOARD_TASK_ADDED'; boardId: string }
  | { type: 'BOARD_TASK_REMOVED'; boardId: string };

/** Everyone with access to a board: its members plus its owner. */
async function boardAudience(boardId: string): Promise<string[]> {
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    select: { ownerId: true, members: { select: { userId: true } } },
  });

  if (!board) return [];

  return [board.ownerId, ...board.members.map((m) => m.userId)];
}

/** Everyone already involved in a task: its assignee plus anyone who has commented. */
async function taskAudience(taskId: string): Promise<string[]> {
  const [task, commenters] = await Promise.all([
    prisma.task.findUnique({ where: { id: taskId }, select: { assigneeId: true } }),
    prisma.comment.findMany({
      where: { taskId },
      select: { userId: true },
      distinct: ['userId'],
    }),
  ]);

  return [
    ...(task?.assigneeId ? [task.assigneeId] : []),
    ...commenters.map((c) => c.userId),
  ];
}

/**
 * Resolves an event to the user ids that should receive a notification.
 *
 * The actor is always excluded and the result is deduplicated, so a person is
 * never told about their own action and never gets the same event twice.
 */
export async function resolveRecipients(
  event: NotifyEvent,
  actorId: string,
): Promise<string[]> {
  let candidates: string[];

  switch (event.type) {
    case 'TASK_ASSIGNED':
      candidates = event.assigneeId ? [event.assigneeId] : [];
      break;
    case 'TASK_COMMENTED':
      candidates = await taskAudience(event.taskId);
      break;
    case 'BOARD_INVITED':
    case 'BOARD_ROLE_CHANGED':
      candidates = [event.targetUserId];
      break;
    case 'BOARD_TASK_ADDED':
    case 'BOARD_TASK_REMOVED':
      candidates = await boardAudience(event.boardId);
      break;
  }

  return [...new Set(candidates)].filter((id) => id !== actorId);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/notification-recipients.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/recipients.ts tests/unit/notification-recipients.test.ts
git commit -m "feat: add notification recipient resolution"
```

---

### Task 6: The notify() entry point

**Files:**
- Create: `lib/notifications/notify.ts`

**Interfaces:**
- Consumes: `resolveRecipients`, `NotifyEvent` (Task 5); `publishEvent`, `CHANNELS`, `EventType` from `@/lib/redis`; `NotificationMeta` (Task 3).
- Produces: `notify(input: NotifyInput): Promise<void>` and the exported `NotifyInput` interface.

- [ ] **Step 1: Implement `notify`**

Create `lib/notifications/notify.ts` (2-space indent):

```ts
import { prisma } from '@/lib/prisma';
import { publishEvent, CHANNELS, EventType } from '@/lib/redis';
import { logger } from '@/lib/logger';
import { resolveRecipients, type NotifyEvent } from './recipients';
import type { NotificationMeta } from '@/lib/types';

export interface NotifyInput {
  event: NotifyEvent;
  actorId: string;
  actorName?: string | null;
  boardId?: string | null;
  boardTitle?: string | null;
  taskId?: string | null;
  taskTitle?: string | null;
  meta?: NotificationMeta | null;
}

/**
 * Writes one notification row per recipient and publishes each on that user's
 * Redis channel.
 *
 * Never throws. A notification is a side effect of the caller's real work —
 * failing to record one must not fail the task creation or comment that
 * triggered it. Errors are logged and swallowed, matching how the existing
 * routes guard their publishEvent calls.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const recipients = await resolveRecipients(input.event, input.actorId);
    if (recipients.length === 0) return;

    // createManyAndReturn gives us the generated ids, which the client needs in
    // order to mark a notification read. Plain createMany does not return rows.
    const rows = await prisma.notification.createManyAndReturn({
      data: recipients.map((userId) => ({
        userId,
        type: input.event.type,
        actorId: input.actorId,
        actorName: input.actorName ?? null,
        boardId: input.boardId ?? null,
        boardTitle: input.boardTitle ?? null,
        taskId: input.taskId ?? null,
        taskTitle: input.taskTitle ?? null,
        meta: input.meta ?? undefined,
      })),
    });

    await Promise.all(
      rows.map((row) =>
        publishEvent(CHANNELS.USER(row.userId), {
          type: EventType.NOTIFICATION_CREATED,
          data: { notification: { ...row, actor: null } },
        }),
      ),
    );
  } catch (err) {
    logger.error({ err, event: input.event.type }, 'Failed to record notification');
  }
}
```

The published payload sets `actor: null`. The client invalidates and refetches rather than rendering the pushed row, so hydrating the actor here would be wasted work — this matches the invalidate-don't-patch convention used everywhere else in the app.

- [ ] **Step 2: Type-check**

Run: `npx prisma generate && npm run check-types`
Expected: PASS. If `createManyAndReturn` is not found on the delegate, the client is stale — rerun `npx prisma generate`.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add lib/notifications/notify.ts
git commit -m "feat: add notify() entry point"
```

---

### Task 7: API routes

**Files:**
- Create: `app/api/notifications/route.ts`, `app/api/notifications/[id]/read/route.ts`, `app/api/notifications/read-all/route.ts`
- Test: `tests/integration/notification-routes.test.ts`

**Interfaces:**
- Consumes: `withAuth`, `prisma`, `endOfIsoWeek` (Task 2).
- Produces:
  - `GET /api/notifications?cursor=&limit=` → `NotificationPage`
  - `PATCH /api/notifications/[id]/read` → `{ message: string }`
  - `PATCH /api/notifications/read-all` → `{ count: number }`

There is no route conflict between `read-all` and `[id]/read`: they sit at different depths (`/notifications/read-all` is one segment past the collection, `/notifications/<id>/read` is two).

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/notification-routes.test.ts` (2-space indent):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = {
  notification: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    updateMany: vi.fn(),
  },
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

const mockSession = { user: { id: 'user-1', email: 'test@test.com', name: 'Test' } };

vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(() => Promise.resolve(mockSession)),
}));

vi.mock('@/lib/auth/auth-options', () => ({ authOptions: {} }));

beforeEach(() => {
  vi.clearAllMocks();
});

function row(id: string) {
  return {
    id,
    userId: 'user-1',
    type: 'TASK_COMMENTED',
    actorId: 'user-2',
    boardId: 'board-1',
    taskId: 'task-1',
    actorName: 'Ada',
    boardTitle: 'Roadmap',
    taskTitle: 'Fix login',
    meta: null,
    readAt: null,
    deleteAt: null,
    createdAt: new Date('2026-09-03T12:00:00.000Z'),
    actor: null,
  };
}

describe('GET /api/notifications', () => {
  it('returns a page scoped to the session user with the unread count', async () => {
    mockPrisma.notification.findMany.mockResolvedValue([row('n-1'), row('n-2')]);
    mockPrisma.notification.count.mockResolvedValue(2);

    const { GET } = await import('@/app/api/notifications/route');
    const res = await GET(
      new Request('http://localhost/api/notifications?limit=5') as never,
      { params: Promise.resolve({}) } as never,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.items).toHaveLength(2);
    expect(body.unreadCount).toBe(2);
    expect(body.nextCursor).toBeNull();
    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1' } }),
    );
  });

  it('returns a cursor when more rows exist than the page size', async () => {
    mockPrisma.notification.findMany.mockResolvedValue(
      ['n-1', 'n-2', 'n-3', 'n-4', 'n-5', 'n-6'].map(row),
    );
    mockPrisma.notification.count.mockResolvedValue(6);

    const { GET } = await import('@/app/api/notifications/route');
    const res = await GET(
      new Request('http://localhost/api/notifications?limit=5') as never,
      { params: Promise.resolve({}) } as never,
    );
    const body = await res.json();

    expect(body.items).toHaveLength(5);
    expect(body.nextCursor).toBe('n-5');
  });
});

describe('PATCH /api/notifications/[id]/read', () => {
  it('stamps readAt and deleteAt scoped to the session user', async () => {
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 1 });

    const { PATCH } = await import('@/app/api/notifications/[id]/read/route');
    const res = await PATCH(
      new Request('http://localhost/api/notifications/n-1/read', { method: 'PATCH' }) as never,
      { params: Promise.resolve({ id: 'n-1' }) } as never,
    );

    expect(res.status).toBe(200);

    const args = mockPrisma.notification.updateMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ id: 'n-1', userId: 'user-1', readAt: null });
    expect(args.data.readAt).toBeInstanceOf(Date);
    expect(args.data.deleteAt).toBeInstanceOf(Date);
  });

  it('returns 404 for a notification belonging to someone else', async () => {
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.notification.findFirst.mockResolvedValue(null);

    const { PATCH } = await import('@/app/api/notifications/[id]/read/route');
    const res = await PATCH(
      new Request('http://localhost/api/notifications/n-9/read', { method: 'PATCH' }) as never,
      { params: Promise.resolve({ id: 'n-9' }) } as never,
    );

    expect(res.status).toBe(404);
  });

  it('is idempotent for an already-read notification', async () => {
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.notification.findFirst.mockResolvedValue({ id: 'n-1' });

    const { PATCH } = await import('@/app/api/notifications/[id]/read/route');
    const res = await PATCH(
      new Request('http://localhost/api/notifications/n-1/read', { method: 'PATCH' }) as never,
      { params: Promise.resolve({ id: 'n-1' }) } as never,
    );

    expect(res.status).toBe(200);
  });
});

describe('PATCH /api/notifications/read-all', () => {
  it('marks every unread notification of the session user', async () => {
    mockPrisma.notification.updateMany.mockResolvedValue({ count: 4 });

    const { PATCH } = await import('@/app/api/notifications/read-all/route');
    const res = await PATCH(
      new Request('http://localhost/api/notifications/read-all', { method: 'PATCH' }) as never,
      { params: Promise.resolve({}) } as never,
    );
    const body = await res.json();

    expect(body.count).toBe(4);
    expect(mockPrisma.notification.updateMany.mock.calls[0][0].where).toMatchObject({
      userId: 'user-1',
      readAt: null,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/integration/notification-routes.test.ts`
Expected: FAIL — cannot resolve `@/app/api/notifications/route`.

- [ ] **Step 3: Implement the feed route**

Create `app/api/notifications/route.ts` (2-space indent):

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/api-guard';

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 50;

/**
 * GET /api/notifications?cursor=<id>&limit=<n>
 *
 * Newest first. Cursor-based rather than offset: new notifications arrive at
 * the head of the feed, so an offset page would skip or repeat rows.
 *
 * No RBAC check — these are own-user rows and board permissions are irrelevant
 * once a notification exists. Scoping every query by `userId` is the guard.
 */
export const GET = withAuth(async (req, { userId }) => {
  const url = new URL(req.url);
  const cursor = url.searchParams.get('cursor');
  const requested = parseInt(url.searchParams.get('limit') ?? '', 10);
  const limit = Math.min(
    Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_LIMIT,
    MAX_LIMIT,
  );

  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1, // one extra row tells us whether another page exists
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      actor: { select: { id: true, name: true, email: true, image: true } },
    },
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const unreadCount = await prisma.notification.count({ where: { userId, readAt: null } });

  return NextResponse.json({
    items,
    nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
    unreadCount,
  });
});
```

- [ ] **Step 4: Implement the mark-one-read route**

Create `app/api/notifications/[id]/read/route.ts` (2-space indent):

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/api-guard';
import { endOfIsoWeek } from '@/lib/utils/end-of-week';

/**
 * PATCH /api/notifications/[id]/read
 *
 * Reading is what starts the retention clock: deleteAt is the end of the ISO
 * week containing readAt, and the daily sweep in ws-server collects it then.
 *
 * The update is scoped by userId as well as id, so one user cannot mark
 * another's notifications. A miss returns 404 rather than 403 — a 403 would
 * confirm that the row exists.
 */
export const PATCH = withAuth<{ id: string }>(async (_req, { params, userId }) => {
  const { id } = params;
  const now = new Date();

  const { count } = await prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: now, deleteAt: endOfIsoWeek(now) },
  });

  if (count === 0) {
    // Either it is already read (fine, stay idempotent) or it is not ours.
    const existing = await prisma.notification.findFirst({
      where: { id, userId },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }
  }

  return NextResponse.json({ message: 'Marked read' });
});
```

- [ ] **Step 5: Implement the mark-all-read route**

Create `app/api/notifications/read-all/route.ts` (2-space indent):

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/api-guard';
import { endOfIsoWeek } from '@/lib/utils/end-of-week';

/**
 * PATCH /api/notifications/read-all
 *
 * The escape valve. Because reads are per-click, a notification nobody clicks
 * never gets a deleteAt and so never expires; without this the feed would grow
 * without bound for anyone who ignores it.
 */
export const PATCH = withAuth(async (_req, { userId }) => {
  const now = new Date();

  const { count } = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: now, deleteAt: endOfIsoWeek(now) },
  });

  return NextResponse.json({ count });
});
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/integration/notification-routes.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 7: Type-check and lint**

Run: `npm run check-types && npm run lint`
Expected: both pass with no output.

- [ ] **Step 8: Commit**

```bash
git add app/api/notifications tests/integration/notification-routes.test.ts
git commit -m "feat: add notification API routes"
```

---

### Task 8: User rooms in ws-server

The structural change. Today a socket belongs to exactly one board room and the Redis bridge only subscribes to `board:*`, so a user on the dashboard receives nothing.

**Files:**
- Modify: `ws-server.ts`

**Interfaces:**
- Consumes: `CHANNELS.USER` and `EventType.NOTIFICATION_CREATED` (Task 3), published by `notify()` (Task 6).
- Produces: delivery of `notification:created` to every socket belonging to the recipient.

- [ ] **Step 1: Add the user-room map**

In `ws-server.ts`, directly after the `rooms` and `meta` declarations in the "Room & Socket State" section:

```ts
/**
 * Per-user set of connected sockets.
 *
 * Unlike board rooms there is no join message: userId is attached during the
 * upgrade-time auth, so every authenticated socket is implicitly in its own
 * user room from the moment it connects. A user may have several sockets (two
 * tabs), hence a set.
 */
const userRooms = new Map<string, Set<WebSocketWithMeta>>();
```

- [ ] **Step 2: Add the user-room helpers**

In the "Room helpers" section, after `broadcastToRoom`:

```ts
function joinUserRoom(ws: WebSocketWithMeta, userId: string) {
  if (!userRooms.has(userId)) userRooms.set(userId, new Set());
  userRooms.get(userId)!.add(ws);
}

function leaveUserRoom(ws: WebSocketWithMeta, userId: string) {
  const room = userRooms.get(userId);
  if (!room) return;

  room.delete(ws);
  if (room.size === 0) userRooms.delete(userId);
}

/** Send a JSON message to every socket belonging to one user. */
function sendToUser(userId: string, msg: object) {
  const room = userRooms.get(userId);
  if (!room) return;

  const payload = JSON.stringify(msg);
  for (const client of room) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}
```

- [ ] **Step 3: Join and leave on the connection lifecycle**

In the `wss.on('connection', ...)` handler, immediately after `meta.set(ws, m);`:

```ts
  joinUserRoom(ws, m.userId);
```

In that handler's `ws.on('close', ...)`, before `leaveRoom(ws);`:

```ts
    leaveUserRoom(ws, m.userId);
```

And in `ws.on('error', ...)`, before `leaveRoom(ws);`:

```ts
    leaveUserRoom(ws, m.userId);
```

- [ ] **Step 4: Subscribe to the user pattern and route by scope**

In `setupRedisSubscriptions`, replace the `psubscribe` call and the whole `pmessage` handler with:

```ts
  subscriber.psubscribe('board:*', 'user:*', (err, count) => {
    if (err) {
      logger.error({ err }, 'Failed to subscribe to Redis channels');
      return;
    }
    logger.info(`Subscribed to ${count} Redis channel pattern(s)`);
  });

  subscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
    try {
      const event = JSON.parse(message);
      const [scope, id] = channel.split(':');

      if (!id) {
        logger.error({ channel }, 'Invalid channel format');
        return;
      }

      if (scope === 'user') {
        sendToUser(id, { type: event.type, data: event.data });
        logger.debug(`Delivering ${event.type} to user ${id}`);
        return;
      }

      // Board scope: broadcast to everyone in the room.
      broadcastToRoom(id, null, { type: event.type, data: event.data });
      logger.debug(`Broadcasting ${event.type} to board ${id}`);
    } catch (err) {
      logger.error({ err }, 'Error processing Redis message');
    }
  });
```

- [ ] **Step 5: Type-check**

Run: `npm run check-types`
Expected: PASS.

- [ ] **Step 6: Verify delivery by hand**

Start the dev servers with `npm run dev`. In a second terminal:

```bash
docker exec -i $(docker ps -qf name=redis) redis-cli \
  PUBLISH user:test-user-id '{"type":"notification:created","data":{"notification":{"id":"n-1"}}}'
```

Expected: the ws-server log shows `Delivering notification:created to user test-user-id`. `redis-cli` printing `1` means one Redis subscriber (ws-server) received it; `0` means ws-server is not running or did not subscribe.

- [ ] **Step 7: Commit**

```bash
git add ws-server.ts
git commit -m "feat: route user-scoped events to per-user socket rooms"
```

---

### Task 9: Daily retention sweep

**Files:**
- Create: `lib/notifications/sweep.ts`
- Modify: `ws-server.ts`
- Test: `tests/unit/notification-sweep.test.ts`

**Interfaces:**
- Consumes: `prisma`, `logger`.
- Produces: `sweepExpiredNotifications(now?: Date): Promise<number>`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/notification-sweep.test.ts` (2-space indent):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = {
  notification: { deleteMany: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

const { sweepExpiredNotifications } = await import('@/lib/notifications/sweep');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sweepExpiredNotifications', () => {
  it('deletes only rows whose deleteAt has passed', async () => {
    mockPrisma.notification.deleteMany.mockResolvedValue({ count: 3 });
    const now = new Date('2026-09-13T23:59:59.999Z');

    const count = await sweepExpiredNotifications(now);

    expect(count).toBe(3);
    expect(mockPrisma.notification.deleteMany).toHaveBeenCalledWith({
      where: { deleteAt: { lte: now } },
    });
  });

  it('never touches unread notifications, which have a null deleteAt', async () => {
    mockPrisma.notification.deleteMany.mockResolvedValue({ count: 0 });

    await sweepExpiredNotifications(new Date('2026-09-13T00:00:00.000Z'));

    // `deleteAt: { lte: ... }` cannot match NULL in Postgres, so an unread row
    // is unreachable by this query. Asserting the shape is what guarantees it.
    const where = mockPrisma.notification.deleteMany.mock.calls[0][0].where;
    expect(where).toEqual({ deleteAt: { lte: expect.any(Date) } });
    expect(where.deleteAt).not.toBeNull();
  });

  it('reports zero when there is nothing to collect', async () => {
    mockPrisma.notification.deleteMany.mockResolvedValue({ count: 0 });

    expect(await sweepExpiredNotifications()).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/notification-sweep.test.ts`
Expected: FAIL — cannot resolve `@/lib/notifications/sweep`.

- [ ] **Step 3: Implement the sweep function**

Create `lib/notifications/sweep.ts` (2-space indent):

```ts
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * Deletes notifications whose retention window has closed.
 *
 * Only rows with a deleteAt are eligible, and deleteAt is set exclusively when
 * a notification is read — so an unread notification can never be swept out
 * from under someone.
 *
 * Idempotent and safe to run concurrently: if several containers sweep at once
 * the later deletes simply find fewer rows.
 */
export async function sweepExpiredNotifications(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.notification.deleteMany({
    where: { deleteAt: { lte: now } },
  });

  if (count > 0) {
    logger.info({ count }, 'Swept expired notifications');
  }

  return count;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/unit/notification-sweep.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Wire it into ws-server**

Add the import alongside the other `./lib` imports at the top of `ws-server.ts`:

```ts
import { sweepExpiredNotifications } from './lib/notifications/sweep';
```

Add the constant next to `HEARTBEAT_INTERVAL_MS` in the Configuration section:

```ts
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
```

Add this section immediately before the "Start" section:

```ts
// ─── Notification Retention Sweep ──────────────────────────────────────────────

function runSweep() {
  void sweepExpiredNotifications().catch((err) => {
    logger.error({ err }, 'Notification sweep failed');
  });
}

// Run once at boot as well as daily: a container that restarts more often than
// once a day would otherwise never reach the interval.
runSweep();

const sweep = setInterval(runSweep, SWEEP_INTERVAL_MS);
```

- [ ] **Step 6: Clear the interval on shutdown**

In `shutdown()`, immediately after `clearInterval(heartbeat);`:

```ts
  clearInterval(sweep);
```

- [ ] **Step 7: Type-check and lint**

Run: `npm run check-types && npm run lint`
Expected: both pass.

- [ ] **Step 8: Verify the sweep runs at boot**

Run: `npx tsx ws-server.ts`
Expected: the server starts and logs `> WebSocket server ready on port 3002`. With no expired rows the sweep logs nothing — it only logs when `count > 0` — so the pass condition is the absence of a `Notification sweep failed` error. Stop with Ctrl-C and confirm the shutdown logs appear.

- [ ] **Step 9: Commit**

```bash
git add lib/notifications/sweep.ts ws-server.ts tests/unit/notification-sweep.test.ts
git commit -m "feat: sweep expired notifications daily"
```

---

### Task 10: Publish the missing board sync events

Fills a pre-existing gap. `EventType` declares nine events and `use-board-realtime.tsx` subscribes to all of them, but only `task:moved` and `comment:added` are ever published — so today a second tab does not see a task appear, change, or disappear.

These are **sync** events on `board:<boardId>`, broadcast to everyone viewing the board including the actor's own other tabs. They are unrelated to notifications, which go to `user:<userId>` and always exclude the actor.

**Files:**
- Modify: `app/api/boards/[boardId]/tasks/route.ts`
- Modify: `app/api/boards/[boardId]/tasks/[taskId]/route.ts`
- Modify: `app/api/boards/[boardId]/tasks/[taskId]/comments/[commentId]/route.ts`

**Interfaces:**
- Consumes: `publishEvent`, `CHANNELS`, `EventType` from `@/lib/redis` — all three already exist and are used by `tasks/[taskId]/move/route.ts`, which is the pattern to copy.
- Produces: live `task:created`, `task:updated`, `task:deleted`, `comment:updated` and `comment:deleted` events. The client callbacks in `use-board-realtime.tsx` already exist and need no change.

Every publish follows the shape already used by the two working publishers: after the successful write, wrapped in `try`/`catch` that logs and swallows, so a Redis outage cannot fail the request.

- [ ] **Step 1: Publish task:created**

In `app/api/boards/[boardId]/tasks/route.ts`, add the import:

```ts
import { publishEvent, CHANNELS, EventType } from '@/lib/redis';
```

In `POST`, after `const task = await prisma.task.create({...})` and before the `return`:

```ts
  try {
    await publishEvent(CHANNELS.BOARD(boardId), {
      type: EventType.TASK_CREATED,
      data: { task },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to publish task created event');
  }
```

Add `import { logger } from '@/lib/logger';` if the file does not already have it. Note the two existing publishers use `console.error` here; `logger` is the documented convention and is what new code should use.

- [ ] **Step 2: Publish task:updated and task:deleted**

In `app/api/boards/[boardId]/tasks/[taskId]/route.ts`, add the same two imports.

In `PATCH`, after `const task = await prisma.task.update({...})` and before the `return`:

```ts
  try {
    await publishEvent(CHANNELS.BOARD(boardId), {
      type: EventType.TASK_UPDATED,
      data: { task },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to publish task updated event');
  }
```

In `DELETE`, after the re-ordering block and before the `return`:

```ts
  try {
    await publishEvent(CHANNELS.BOARD(boardId), {
      type: EventType.TASK_DELETED,
      data: { taskId },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to publish task deleted event');
  }
```

The payload shapes are fixed by `TaskCreatedPayload`, `TaskUpdatedPayload` and `TaskDeletedPayload` in `lib/types.ts` — `{ task }` for the first two, `{ taskId }` for the third. Do not invent different shapes; the client handlers destructure exactly these.

- [ ] **Step 3: Publish comment:updated and comment:deleted**

In `app/api/boards/[boardId]/tasks/[taskId]/comments/[commentId]/route.ts`, add the same two imports.

In `PATCH`, after `const updated = await prisma.comment.update({...})` and before the `return`:

```ts
  try {
    await publishEvent(CHANNELS.BOARD(boardId), {
      type: EventType.COMMENT_UPDATED,
      data: { comment: updated },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to publish comment updated event');
  }
```

In `DELETE`, after `await prisma.comment.delete({...})` and before the `return`:

```ts
  try {
    await publishEvent(CHANNELS.BOARD(boardId), {
      type: EventType.COMMENT_DELETED,
      data: { commentId },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to publish comment deleted event');
  }
```

- [ ] **Step 4: Type-check and lint**

Run: `npm run check-types && npm run lint`
Expected: both pass. A type error on a `data` payload means the shape does not match `WsServerEventMap` — fix the payload, not the type.

- [ ] **Step 5: Verify two tabs stay in sync**

With `npm run dev` running, open the same board in two browser tabs signed in as the same user. In tab A, create a task, rename it, then delete it.

Expected: each change appears in tab B without a reload. This is the behaviour that was silently missing — the callbacks existed, nothing was feeding them.

- [ ] **Step 6: Commit**

```bash
git add 'app/api/boards/[boardId]/tasks/route.ts' 'app/api/boards/[boardId]/tasks/[taskId]/route.ts' 'app/api/boards/[boardId]/tasks/[taskId]/comments/[commentId]/route.ts'
git commit -m "feat: publish the task and comment board sync events"
```

---

### Task 11: Wire notify() into the trigger routes

Five routes. Every `notify()` call goes **after** the successful Prisma write; `notify()` swallows its own errors, so a failure cannot break the request.

**Files:**
- Modify: `app/api/boards/[boardId]/tasks/route.ts`
- Modify: `app/api/boards/[boardId]/tasks/[taskId]/route.ts`
- Modify: `app/api/boards/[boardId]/members/route.ts`
- Modify: `app/api/boards/[boardId]/tasks/[taskId]/comments/route.ts`
- Modify: `app/api/boards/[boardId]/members/[memberId]/route.ts`

**Interfaces:**
- Consumes: `notify` (Task 6).
- Produces: notification rows for the six live event types.

- [ ] **Step 1: Read the role-change route before editing it**

Run: `cat 'app/api/boards/[boardId]/members/[memberId]/route.ts'`
Expected: a `PATCH` handler that resolves the `BoardMember` row into a local `membership` (carrying `userId`), calls `updateBoardMemberRole`, and returns the result as `updated`. The target user is **`membership.userId`** — `updated` is the role row and does not necessarily surface it. Step 7 uses `membership.userId` and the validated `role` from the request body.

- [ ] **Step 2: Notify on task creation**

In `app/api/boards/[boardId]/tasks/route.ts`, add the import after the existing ones:

```ts
import { notify } from '@/lib/notifications/notify';
```

In `POST`, between `const task = await prisma.task.create({...})` and `return NextResponse.json(task, { status: 201 });`:

```ts
  const [actor, boardRow] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    prisma.board.findUnique({ where: { id: boardId }, select: { title: true } }),
  ]);

  await notify({
    event: { type: 'BOARD_TASK_ADDED', boardId },
    actorId: userId,
    actorName: actor?.name ?? null,
    boardId,
    boardTitle: boardRow?.title ?? null,
    taskId: task.id,
    taskTitle: task.title,
  });

  if (task.assigneeId) {
    await notify({
      event: { type: 'TASK_ASSIGNED', assigneeId: task.assigneeId },
      actorId: userId,
      actorName: actor?.name ?? null,
      boardId,
      boardTitle: boardRow?.title ?? null,
      taskId: task.id,
      taskTitle: task.title,
    });
  }
```

Creating a task already assigned to someone else produces two notifications for that person — one "created", one "assigned". That is intended: they are different facts, and the assignment is the one that needs acting on.

- [ ] **Step 3: Notify on assignment change**

In `app/api/boards/[boardId]/tasks/[taskId]/route.ts`, add the import:

```ts
import { notify } from '@/lib/notifications/notify';
```

In `PATCH`, after `const task = await prisma.task.update({...})` and before its `return`:

```ts
  // Only a change of assignee is worth a notification: title and priority edits
  // are not, and re-saving the same assignee must not re-notify.
  if (assigneeId !== undefined && task.assigneeId && task.assigneeId !== existing.assigneeId) {
    const [actor, boardRow] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
      prisma.board.findUnique({ where: { id: boardId }, select: { title: true } }),
    ]);

    await notify({
      event: { type: 'TASK_ASSIGNED', assigneeId: task.assigneeId },
      actorId: userId,
      actorName: actor?.name ?? null,
      boardId,
      boardTitle: boardRow?.title ?? null,
      taskId: task.id,
      taskTitle: task.title,
    });
  }
```

This reads `existing` — the pre-update row from `getTaskForBoard`. Confirm that variable is in scope in `PATCH`; if the handler does not already fetch it, add `const existing = await getTaskForBoard(taskId, boardId);` before the update and return 404 when it is null, mirroring `DELETE`. It must also select `assigneeId`.

- [ ] **Step 4: Notify on task deletion**

Still in `app/api/boards/[boardId]/tasks/[taskId]/route.ts`, in `DELETE`: after the `existing` null-check succeeds and **before** `await prisma.task.delete(...)`, capture what the notification needs — the row is about to disappear:

```ts
  const [actor, boardRow] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    prisma.board.findUnique({ where: { id: boardId }, select: { title: true } }),
  ]);
  const deletedTitle = existing.title;
```

Then after the delete and the re-ordering block, before the final `return`:

```ts
  await notify({
    event: { type: 'BOARD_TASK_REMOVED', boardId },
    actorId: userId,
    actorName: actor?.name ?? null,
    boardId,
    boardTitle: boardRow?.title ?? null,
    taskId: null,
    taskTitle: deletedTitle,
  });
```

`taskId` is null because the task no longer exists — clicking the notification should land on the board, not on a dead task link.

- [ ] **Step 5: Notify on a comment**

In `app/api/boards/[boardId]/tasks/[taskId]/comments/route.ts`, add the import:

```ts
import { notify } from '@/lib/notifications/notify';
```

In `POST`, after the existing `publishEvent` try/catch block and before `return NextResponse.json(comment, { status: 201 });`:

```ts
  const [boardRow, taskRow] = await Promise.all([
    prisma.board.findUnique({ where: { id: boardId }, select: { title: true } }),
    prisma.task.findUnique({ where: { id: taskId }, select: { title: true } }),
  ]);

  await notify({
    event: { type: 'TASK_COMMENTED', taskId },
    actorId: userId,
    actorName: comment.user.name ?? null,
    boardId,
    boardTitle: boardRow?.title ?? null,
    taskId,
    taskTitle: taskRow?.title ?? null,
  });
```

The comment's `user` is already included by the existing query, so the actor's name needs no extra lookup.

- [ ] **Step 6: Notify on a board invite**

In `app/api/boards/[boardId]/members/route.ts`, add the import:

```ts
import { notify } from '@/lib/notifications/notify';
```

In `POST`, after `const member = await addBoardMember(...)` and before the `return`:

```ts
  const [actor, boardRow] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    prisma.board.findUnique({ where: { id: boardId }, select: { title: true } }),
  ]);

  await notify({
    event: { type: 'BOARD_INVITED', targetUserId: targetUser.id },
    actorId: userId,
    actorName: actor?.name ?? null,
    boardId,
    boardTitle: boardRow?.title ?? null,
  });
```

- [ ] **Step 7: Notify on a role change**

In `app/api/boards/[boardId]/members/[memberId]/route.ts`, add the import:

```ts
import { notify } from '@/lib/notifications/notify';
```

In `PATCH`, after `updateBoardMemberRole` returns and before the handler's `return`:

```ts
  const [actor, boardRow] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    prisma.board.findUnique({ where: { id: boardId }, select: { title: true } }),
  ]);

  await notify({
    event: { type: 'BOARD_ROLE_CHANGED', targetUserId: membership.userId },
    actorId: userId,
    actorName: actor?.name ?? null,
    boardId,
    boardTitle: boardRow?.title ?? null,
    meta: { role },
  });
```

- [ ] **Step 8: Type-check, lint and run the whole suite**

Run: `npm run check-types && npm run lint && npx vitest run`
Expected: all pass. The existing integration tests mock `@/lib/prisma` with a partial object; if one now fails because `notification.createManyAndReturn` or `user.findUnique` is missing from a mock, add the missing `vi.fn()` to that test's `mockPrisma` rather than changing route code.

- [ ] **Step 9: Commit**

```bash
git add app/api/boards
git commit -m "feat: create notifications from task, comment and member events"
```

---

### Task 12: Client data layer

**Files:**
- Modify: `lib/api.ts`, `lib/hooks/use-queries.ts`
- Create: `lib/hooks/use-user-realtime.tsx`

**Interfaces:**
- Consumes: `NotificationPage` (Task 3), the routes from Task 7, `EventType.NOTIFICATION_CREATED`.
- Produces:
  - `notificationsApi.list(cursor?, limit?)`, `.markRead(id)`, `.markAllRead()`
  - `queryKeys.notifications`
  - `useNotifications()`, `useMarkNotificationRead()`, `useMarkAllNotificationsRead()`
  - `useUserRealtime()`

- [ ] **Step 1: Add the API client**

In `lib/api.ts`, add `NotificationPage` to the type import block at the top, then append a new section at the end of the file:

```ts
// ─── Notifications ─────────────────────────────────────────────────────────────

export const notificationsApi = {
  list: (cursor?: string | null, limit = 5) =>
    apiFetch<NotificationPage>(
      `/api/notifications?limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`
    ),

  markRead: (id: string) =>
    apiFetch<{ message: string }>(`/api/notifications/${id}/read`, { method: 'PATCH' }),

  markAllRead: () =>
    apiFetch<{ count: number }>('/api/notifications/read-all', { method: 'PATCH' }),
};
```

- [ ] **Step 2: Add the query key and hooks**

In `lib/hooks/use-queries.ts`: add `useInfiniteQuery` to the `@tanstack/react-query` import, `notificationsApi` to the `@/lib/api` import, and `NotificationPage` to the type import.

Add to the `queryKeys` object:

```ts
  notifications: ['notifications'] as const,
```

Append a new section at the end of the file:

```ts
// ─── Notifications ─────────────────────────────────────────────────────────────

export function useNotifications() {
  return useInfiniteQuery({
    queryKey: queryKeys.notifications,
    queryFn: ({ pageParam }) => notificationsApi.list(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last: NotificationPage) => last.nextCursor,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notifications }),
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notifications }),
    onError: (err: Error) => toast.error(err.message),
  });
}
```

- [ ] **Step 3: Add the realtime hook**

Create `lib/hooks/use-user-realtime.tsx` (2-space indent):

```tsx
'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from '../websocket-provider';
import { EventType } from '../types';
import { queryKeys } from './use-queries';

/**
 * Subscribes to the current user's notification stream.
 *
 * There is nothing to join: ws-server puts every authenticated socket in its
 * own user room at connection time, so this hook only listens. Like every
 * other real-time path in the app it invalidates rather than patching — the
 * feed refetches and stays the single source of truth.
 */
export function useUserRealtime() {
  const { isConnected, on, off } = useWebSocket();
  const qc = useQueryClient();

  useEffect(() => {
    if (!isConnected) return;

    const handler = () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications });
    };

    on(EventType.NOTIFICATION_CREATED, handler);
    return () => off(EventType.NOTIFICATION_CREATED, handler);
  }, [isConnected, on, off, qc]);
}
```

- [ ] **Step 4: Type-check and lint**

Run: `npm run check-types && npm run lint`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add lib/api.ts lib/hooks/use-queries.ts lib/hooks/use-user-realtime.tsx
git commit -m "feat: add notification queries and user realtime hook"
```

---

### Task 13: Bell icon, dropdown and navbar

**Files:**
- Create: `components/icons/bell-icon.tsx`, `components/notifications/notification-item.tsx`, `components/notifications/notification-bell.tsx`
- Modify: `components/icons/index.ts`, `components/navbar.tsx`
- Test: `tests/components/notification-bell.test.tsx`

**Interfaces:**
- Consumes: `useNotifications`, `useMarkNotificationRead`, `useMarkAllNotificationsRead` (Task 12), `useUserRealtime` (Task 12), `formatNotification` (Task 4), `formatRelativeTime` (Task 2), `AppNotification` (Task 3).
- Produces: `<NotificationBell />`, rendered by the navbar.

All files in this task use **4-space** indentation.

- [ ] **Step 1: Add the bell icon**

Create `components/icons/bell-icon.tsx`:

```tsx
import { StrokeIcon, type IconProps } from './icon';

export function BellIcon(props: IconProps) {
    return (
        <StrokeIcon {...props}>
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </StrokeIcon>
    );
}
```

Add to `components/icons/index.ts`, between the `AlertTriangleIcon` and `ChevronDownIcon` exports:

```ts
export { BellIcon } from './bell-icon';
```

- [ ] **Step 2: Write the failing component test**

Create `tests/components/notification-bell.test.tsx` — `// @vitest-environment happy-dom` must be on **line 1**:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { AppNotification, NotificationPage } from '@/lib/types';

const markRead = vi.fn();
const markAllRead = vi.fn();
const fetchNextPage = vi.fn();
const push = vi.fn();

let pages: NotificationPage[] = [];
let hasNextPage = false;

vi.mock('@/lib/hooks/use-queries', () => ({
    useNotifications: () => ({
        data: { pages },
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage: false,
        isLoading: false,
    }),
    useMarkNotificationRead: () => ({ mutate: markRead }),
    useMarkAllNotificationsRead: () => ({ mutate: markAllRead }),
    queryKeys: { notifications: ['notifications'] },
}));

vi.mock('@/lib/hooks/use-user-realtime', () => ({
    useUserRealtime: () => undefined,
}));

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push }),
}));

function makeNotification(id: string, overrides: Partial<AppNotification> = {}): AppNotification {
    return {
        id,
        type: 'TASK_COMMENTED',
        actorId: 'user-2',
        boardId: 'board-1',
        taskId: 'task-1',
        actorName: 'Ada',
        boardTitle: 'Roadmap',
        taskTitle: `Task ${id}`,
        meta: null,
        readAt: null,
        createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        actor: null,
        ...overrides,
    };
}

function page(ids: string[], unreadCount: number, nextCursor: string | null = null): NotificationPage {
    return { items: ids.map((id) => makeNotification(id)), nextCursor, unreadCount };
}

beforeEach(() => {
    vi.clearAllMocks();
    pages = [];
    hasNextPage = false;
});

async function openBell() {
    const { NotificationBell } = await import('@/components/notifications/notification-bell');
    render(<NotificationBell />);
    fireEvent.click(screen.getByRole('button', { name: /notifications/i }));
}

describe('NotificationBell', () => {
    it('shows the unread count on the badge', async () => {
        pages = [page(['n-1', 'n-2'], 3)];
        const { NotificationBell } = await import('@/components/notifications/notification-bell');
        render(<NotificationBell />);

        expect(screen.getByText('3')).toBeTruthy();
    });

    it('renders the notifications in the dropdown with a relative time', async () => {
        pages = [page(['n-1', 'n-2'], 2)];
        await openBell();

        expect(await screen.findByText('Ada commented on Task n-1')).toBeTruthy();
        expect(screen.getByText('Ada commented on Task n-2')).toBeTruthy();
        expect(screen.getAllByText('5m').length).toBe(2);
    });

    it('shows an empty state when there is nothing to show', async () => {
        pages = [page([], 0)];
        await openBell();

        expect(await screen.findByText(/no notifications/i)).toBeTruthy();
    });

    it('marks read and navigates when a notification is clicked', async () => {
        pages = [page(['n-1'], 1)];
        await openBell();

        fireEvent.click(await screen.findByText('Ada commented on Task n-1'));

        expect(markRead).toHaveBeenCalledWith('n-1');
        expect(push).toHaveBeenCalledWith('/boards/board-1?task=task-1');
    });

    it('navigates to the board alone when the task is gone', async () => {
        pages = [{ items: [makeNotification('n-1', { taskId: null })], nextCursor: null, unreadCount: 1 }];
        await openBell();

        fireEvent.click(await screen.findByText('Ada commented on Task n-1'));

        expect(push).toHaveBeenCalledWith('/boards/board-1');
    });

    it('offers load more only when another page exists', async () => {
        pages = [page(['n-1'], 1, 'n-1')];
        hasNextPage = true;
        await openBell();

        fireEvent.click(await screen.findByRole('button', { name: /load more/i }));
        expect(fetchNextPage).toHaveBeenCalled();
    });

    it('marks everything read from the header action', async () => {
        pages = [page(['n-1'], 1)];
        await openBell();

        fireEvent.click(await screen.findByRole('button', { name: /mark all as read/i }));
        expect(markAllRead).toHaveBeenCalled();
    });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/components/notification-bell.test.tsx`
Expected: FAIL — cannot resolve `@/components/notifications/notification-bell`.

- [ ] **Step 4: Implement the notification row**

Create `components/notifications/notification-item.tsx`:

```tsx
'use client';

import { clsx } from 'clsx';
import { Avatar } from '@/components/ui-shared';
import { formatNotification } from '@/lib/notifications/format';
import { formatRelativeTime } from '@/lib/utils/relative-time';
import type { AppNotification } from '@/lib/types';

export function NotificationItem({
    notification,
    onSelect,
}: {
    notification: AppNotification;
    onSelect: (notification: AppNotification) => void;
}) {
    const unread = notification.readAt === null;

    return (
        <button
            type="button"
            onClick={() => onSelect(notification)}
            className={clsx(
                'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--muted)]',
                unread && 'bg-[var(--muted)]/40'
            )}
        >
            <Avatar src={notification.actor?.image} name={notification.actorName} size="sm" />

            <span className="min-w-0 flex-1">
                <span className="block text-sm text-[var(--foreground)]">
                    {formatNotification(notification)}
                </span>
                <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">
                    {formatRelativeTime(notification.createdAt)}
                </span>
            </span>

            {unread && (
                <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]"
                    aria-label="Unread"
                />
            )}
        </button>
    );
}
```

- [ ] **Step 5: Implement the bell**

Create `components/notifications/notification-bell.tsx`:

```tsx
'use client';

import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { useRouter } from 'next/navigation';
import { BellIcon } from '@/components/icons';
import { NotificationItem } from '@/components/notifications/notification-item';
import {
    useNotifications,
    useMarkNotificationRead,
    useMarkAllNotificationsRead,
} from '@/lib/hooks/use-queries';
import { useUserRealtime } from '@/lib/hooks/use-user-realtime';
import type { AppNotification } from '@/lib/types';

export function NotificationBell() {
    // Keeps the feed fresh; ws-server pushes to this user's own room.
    useUserRealtime();

    const router = useRouter();
    const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useNotifications();
    const markRead = useMarkNotificationRead();
    const markAllRead = useMarkAllNotificationsRead();

    const items = data?.pages.flatMap((p) => p.items) ?? [];
    const unreadCount = data?.pages[0]?.unreadCount ?? 0;

    const handleSelect = (notification: AppNotification) => {
        if (notification.readAt === null) {
            markRead.mutate(notification.id);
        }

        if (!notification.boardId) return;

        // A deleted task leaves taskId null, so fall back to the board itself.
        router.push(
            notification.taskId
                ? `/boards/${notification.boardId}?task=${notification.taskId}`
                : `/boards/${notification.boardId}`
        );
    };

    return (
        <Popover className="relative">
            <PopoverButton
                className="relative rounded-lg p-2 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
                aria-label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'}
            >
                <BellIcon className="h-5 w-5" />
                {unreadCount > 0 && (
                    <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-semibold text-[var(--accent-foreground)]">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </PopoverButton>

            <PopoverPanel className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl">
                <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2.5">
                    <h2 className="text-sm font-semibold text-[var(--foreground)]">Notifications</h2>
                    {unreadCount > 0 && (
                        <button
                            type="button"
                            onClick={() => markAllRead.mutate()}
                            className="text-xs text-[var(--muted-foreground)] transition-colors hover:text-[var(--accent)]"
                        >
                            Mark all as read
                        </button>
                    )}
                </div>

                <div className="max-h-96 overflow-y-auto">
                    {items.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">
                            No notifications yet
                        </p>
                    ) : (
                        <ul className="divide-y divide-[var(--border)]">
                            {items.map((notification) => (
                                <li key={notification.id}>
                                    <NotificationItem
                                        notification={notification}
                                        onSelect={handleSelect}
                                    />
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {hasNextPage && (
                    <button
                        type="button"
                        onClick={() => fetchNextPage()}
                        disabled={isFetchingNextPage}
                        className="w-full border-t border-[var(--border)] px-4 py-2.5 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:opacity-50"
                    >
                        {isFetchingNextPage ? 'Loading…' : 'Load more'}
                    </button>
                )}
            </PopoverPanel>
        </Popover>
    );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run tests/components/notification-bell.test.tsx`
Expected: PASS, 7 tests.

- [ ] **Step 7: Render the bell in the navbar**

In `components/navbar.tsx`, add the import:

```tsx
import { NotificationBell } from '@/components/notifications/notification-bell';
```

Then in the right-side group, immediately after `<ConnectionStatus />`:

```tsx
                    <NotificationBell />
```

- [ ] **Step 8: Type-check, lint and run the suite**

Run: `npm run check-types && npm run lint && npx vitest run`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add components/icons/bell-icon.tsx components/icons/index.ts components/notifications components/navbar.tsx tests/components/notification-bell.test.tsx
git commit -m "feat: add notification bell to the navbar"
```

---

### Task 14: Task deep link on the board page

**Files:**
- Modify: `app/boards/[boardId]/page.tsx`

**Interfaces:**
- Consumes: `?task=<taskId>` produced by Task 13's click handler; the existing `openTaskModal` from `lib/stores/ui-store.ts`.
- Produces: nothing further tasks depend on. This is the last task.

This file uses **2-space** indentation.

- [ ] **Step 1: Import the search-params hook**

In `app/boards/[boardId]/page.tsx`, extend the existing `next/navigation` import:

```tsx
import { useParams, useRouter, useSearchParams } from 'next/navigation';
```

Add `useEffect` to the existing `react` import.

- [ ] **Step 2: Open the requested task once the board has loaded**

Inside the page component, after the `useBoard` call and alongside the other hooks — all hooks must run before any early `return` — add:

```tsx
  const searchParams = useSearchParams();
  const requestedTaskId = searchParams.get('task');

  // Deep link from a notification: /boards/<id>?task=<taskId>. The board loads
  // asynchronously, so this waits for the data rather than reading it inline.
  // The param is cleared afterwards, otherwise closing the modal and reopening
  // it would fight this effect re-firing.
  useEffect(() => {
    if (!requestedTaskId || !board) return;

    const task = board.columns
      ?.flatMap((column) => column.tasks ?? [])
      .find((t) => t.id === requestedTaskId);

    if (task) {
      useUIStore.getState().openTaskModal(task);
    }

    router.replace(`/boards/${board.id}`, { scroll: false });
  }, [requestedTaskId, board, router]);
```

Confirm the names as you go: the board data is under whichever variable the header markup already uses (`board`), and `useUIStore` and `router` are both already imported in this file.

- [ ] **Step 3: Type-check and lint**

Run: `npm run check-types && npm run lint`
Expected: both pass. If lint reports a missing effect dependency, add it rather than suppressing the rule.

- [ ] **Step 4: Verify by hand**

With `npm run dev` running and two accounts available:

1. Sign in as user A, create a board, invite user B.
2. In another browser (or a private window) sign in as user B — the bell should show a badge within a second, with no page reload.
3. Click the notification. Expect navigation to the board and, for a task notification, the task modal open on arrival.
4. Reopen the bell: the clicked notification no longer shows its unread dot, and the badge has decremented.

- [ ] **Step 5: Full verification**

Run: `npm run check-types && npm run lint && npx vitest run && npm run build`
Expected: all four pass.

- [ ] **Step 6: Commit**

```bash
git add 'app/boards/[boardId]/page.tsx'
git commit -m "feat: open a task from a notification deep link"
```

---

## Verification checklist

After every task is complete, from `apps/web`:

- [ ] `npx prisma generate` succeeds
- [ ] `npm run check-types` passes
- [ ] `npm run lint` passes with no output
- [ ] `npx vitest run` — all tests pass, including the 92 that existed before this plan
- [ ] `npm run build` succeeds
- [ ] `docker compose up -d` from the repo root, then the manual two-account run in Task 14 Step 4

## Notes for the reviewer

- **`TASK_MOVED` is intentionally absent.** Board activity fans out to every member; on a ten-member board a single drag would write ten rows. Reordering within a column carries no information anyone needs. Do not add it back without revisiting the spec.
- **`boardId` and `taskId` are not foreign keys.** Deliberate, documented in the spec, verified in Task 1 Step 5. A cascade would delete the notification announcing its own subject's deletion.
- **Unread notifications have no `deleteAt` and never expire.** "Mark all as read" is the escape valve. This follows from the per-click read model.
- **`notify()` never throws.** A notification is a side effect; failing to record one must not fail the request that triggered it.
