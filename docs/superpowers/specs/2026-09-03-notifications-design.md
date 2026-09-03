# Notifications — Design

**Date:** 2026-09-03
**Status:** Approved for planning

## Goal

Give every user a notification feed: rows written when other people act on
things they care about, delivered in real time, listed newest-first in a
navbar dropdown, and collected shortly after being read.

## Confirmed decisions

These were settled during brainstorming and are not open questions.

1. **Each user has a feed** — a `Notification[]` relation on `User`, not a
   single row per user.
2. **Triggers:** task assigned, comment on a task you are involved in, board
   invite / role change, and board activity (task added, task removed).
   Task *moves* are deliberately excluded — see "Rejected".
3. **Two distinct event families, named so they cannot be confused.**
   `EventType` is board **sync** — it keeps every viewer of a board, including
   a user's own other tabs, showing the same state, and travels on
   `board:<id>`. `NotificationType` is a **notice to a member** that something
   wants their attention, and travels on `user:<id>`. Their members must not
   share names; see "Naming the two event families".
4. **Read is per-notification click.** Opening the dropdown does not mark
   anything read.
5. **Retention is the calendar week.** A notification read at any point in a
   week is deleted at the end of that week — Sunday 23:59:59.999 UTC, ISO-8601
   weeks (Monday start). Unread notifications never expire.
6. **Clicking navigates** to `/boards/<boardId>?task=<taskId>`, opening the
   task's existing detail modal.
7. **Sweeping runs in `ws-server`** — once at startup, then every 24 hours.
8. **The unpublished board sync events get publishers.** `task:created`,
   `task:updated`, `task:deleted`, `comment:updated` and `comment:deleted` are
   declared and consumed today but nothing emits them; this work fixes that.

## Data model

```prisma
model Notification {
  id         String           @id @default(cuid())
  userId     String           // recipient
  type       NotificationType
  actorId    String?          // who caused it

  // Targets. Deliberately NOT foreign keys — see "Why targets are not relations".
  boardId    String?
  taskId     String?

  // Display snapshots, so a notification survives its subject
  actorName  String?
  boardTitle String?
  taskTitle  String?
  meta       Json?            // type-specific extras, currently { role }

  readAt     DateTime?        // null = unread
  deleteAt   DateTime?        // end of the ISO week containing readAt; null = never swept
  createdAt  DateTime         @default(now())

  user  User  @relation("NotificationRecipient", fields: [userId], references: [id], onDelete: Cascade)
  actor User? @relation("NotificationActor",     fields: [actorId], references: [id], onDelete: SetNull)

  @@index([userId, createdAt(sort: Desc)])  // the feed
  @@index([userId, readAt])                  // unread badge count
  @@index([deleteAt])                        // the sweeper
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

`User` gains two relation fields:

```prisma
notifications      Notification[] @relation("NotificationRecipient")
notificationsActed Notification[] @relation("NotificationActor")
```

### Why targets are not relations

A foreign key from `taskId` to `Task` with `onDelete: Cascade` would delete the
very notification that reads "Ana deleted *Fix login*". `SetNull` would keep the
row but lose the link, and still fires a write on every task delete. Plain
string columns plus snapshot titles keep the history intact and keep task
deletion cheap. The cost is that a link can go stale; the click handler routes
to the board and the board page's existing not-found path handles it.

### Why `deleteAt` is nullable

`deleteAt` is null until the notification is read. That is a direct encoding of
"queued for deletion once viewed" — the sweeper's `where` clause only ever
matches rows a user has actually clicked, so an unread notification cannot be
collected out from under someone.

### Why `meta` is Json

Only `BOARD_ROLE_CHANGED` needs an extra field (`role`). A dedicated column
would be null on every other row. `meta` is typed on the TypeScript side as a
discriminated union keyed by `type`, so the looseness stops at the database
boundary.

## Notification creation

All fan-out lives in `lib/notifications/`, behind one entry point, so a route
never assembles recipients itself:

```ts
await notify({ type: 'COMMENT_ADDED', actorId: userId, boardId, taskId, ... });
```

| File | Responsibility |
|---|---|
| `recipients.ts` | event → recipient user ids. The only place fan-out rules live. |
| `format.ts` | `(type, snapshots) → message string`. Rendered client-side, never stored. |
| `notify.ts` | one `createMany`, then one `publishEvent` per recipient. |

### Recipient rules

| Type | Recipients |
|---|---|
| `TASK_ASSIGNED` | the new assignee |
| `TASK_COMMENTED` | task assignee + everyone who has already commented on that task |
| `BOARD_INVITED`, `BOARD_ROLE_CHANGED` | the target user |
| `BOARD_TASK_ADDED`, `BOARD_TASK_REMOVED` | all board members + the board owner |

The actor is always excluded and the list is deduplicated. A notification is
never created for the person who caused it.

### Message text is not stored

`format.ts` builds the string from `type` plus the snapshot columns at render
time. Storing rendered text would freeze the wording at write time and make any
future copy change or localisation a migration.

## Naming the two event families

Two different things travel over the same WebSocket, and before this change
their names collided — `EventType.TASK_CREATED` and `NotificationType.TASK_CREATED`
would have meant different things in the same codebase.

| | `EventType` (sync) | `NotificationType` (notice) |
|---|---|---|
| Answers | "the board changed, redraw" | "someone needs your attention" |
| Channel | `board:<boardId>` | `user:<userId>` |
| Audience | everyone viewing that board, **including the actor's own other tabs** | one member, never the actor |
| Lifetime | fire and forget | a row that persists until read and swept |

Sync events are why a user with two tabs open sees a task appear in both, and
why they are broadcast to the actor as well — the actor's other tabs need the
update just as much as anyone else's. Notifications are the opposite: the actor
is always excluded, because nobody needs telling about their own action.

The notification types are therefore named for the *notice*, not the mutation:

| Old (collided) | New |
|---|---|
| `COMMENT_ADDED` | `TASK_COMMENTED` |
| `TASK_CREATED` | `BOARD_TASK_ADDED` |
| `TASK_DELETED` | `BOARD_TASK_REMOVED` |

`TASK_ASSIGNED`, `BOARD_INVITED` and `BOARD_ROLE_CHANGED` never collided and
already read as notices, so they keep their names.

## Board sync publishers

`EventType` declares nine events and `use-board-realtime.tsx` wires up callbacks
for all of them, but only two are ever published: `task:moved` and
`comment:added`. The rest are dead wiring — a second tab does not see a task
appear, get edited, or disappear.

This work fills that gap, because it is the same routes being touched:

| Route | Event |
|---|---|
| `POST /boards/[boardId]/tasks` | `task:created` |
| `PATCH /boards/[boardId]/tasks/[taskId]` | `task:updated` |
| `DELETE /boards/[boardId]/tasks/[taskId]` | `task:deleted` |
| `PATCH .../comments/[commentId]` | `comment:updated` |
| `DELETE .../comments/[commentId]` | `comment:deleted` |

Each follows the pattern already set by the two working publishers: publish
after the successful write, inside a `try`/`catch` that logs and swallows, so a
Redis failure cannot fail the request.

These are independent of notifications. A route may emit both — creating a task
publishes `task:created` to the board *and* writes `BOARD_TASK_ADDED`
notifications for the other members — and the two serve different readers.

## Real-time delivery

The existing bus is board-scoped: `ws-server` keys `rooms` by `boardId`, a
socket is in exactly one room, and the Redis bridge only subscribes to
`board:*`. A notification has to reach a user on the dashboard, where no board
is joined. So notifications need a parallel user-scoped room.

```
API route → notify() → Redis PUBLISH user:<userId>
          → ws-server psubscribe 'user:*' → send to that user's sockets
          → client invalidates queryKeys.notifications → feed refetches
```

- **`userRooms: Map<userId, Set<socket>>`** in `ws-server`, populated in the
  `connection` handler and torn down on close and error. No client message is
  needed: `userId` is already attached to the socket during the upgrade-time
  auth, so every authenticated socket is implicitly in its own user room.
- **A second `psubscribe('user:*')`** alongside the existing `board:*`. The
  `pmessage` handler branches on the channel prefix.
- **`lib/types.ts`** gains `CHANNELS.USER(userId)`,
  `EventType.NOTIFICATION_CREATED`, its payload type, and the `WsServerEventMap`
  entry — the four-places rule from CLAUDE.md.

Clients get no optimistic patch from the event; they invalidate and refetch,
matching every other real-time path in the app.

Unlike presence, this room map is Redis-fed rather than authoritative, so it
does **not** inherit the single-container constraint documented in
DEPLOYMENT.md. Each container serves the sockets it holds.

## API surface

| Route | Behaviour |
|---|---|
| `GET /api/notifications?cursor=&limit=5` | `{ items, nextCursor, unreadCount }`, ordered `createdAt desc, id desc` |
| `PATCH /api/notifications/[id]/read` | stamps `readAt = now`, `deleteAt = endOfIsoWeek(now)` |
| `PATCH /api/notifications/read-all` | the same, for every unread row of that user |

All three are wrapped in `withAuth`. There is no RBAC permission check: these
are own-user rows, and board permissions are irrelevant once a notification
exists. Instead **every read and write is scoped `where: { userId }`** (and
`{ id, userId }` for the single-row update), so one user cannot read or mark
another's notifications. A mark-read against someone else's id returns 404, not
403 — it must not reveal that the row exists.

`unreadCount` rides along on the list response, so a single query feeds both the
badge and the dropdown and there is no separate count endpoint to poll.

Pagination is cursor-based on `(createdAt desc, id desc)` with Prisma's
`cursor` + `skip: 1`. Offset paging would skip or repeat rows as new
notifications arrive at the head of the feed, which is exactly what happens
here.

## Client and UI

- `queryKeys.notifications` added to the factory in `lib/hooks/use-queries.ts`;
  `notificationsApi` added to `lib/api.ts`.
- `useNotifications()` — `useInfiniteQuery`, page size 5, so "Load more" is
  `fetchNextPage()`.
- `useMarkNotificationRead()` / `useMarkAllNotificationsRead()` mutations,
  invalidating the notifications key on success.
- `useUserRealtime()` — new hook in `lib/hooks/`, subscribes to
  `NOTIFICATION_CREATED` and invalidates. Mounted by the bell, which the navbar
  renders on every authenticated page.
- `components/notifications/notification-bell.tsx` — trigger, unread badge,
  dropdown. Uses `@headlessui/react` `Popover` (already a dependency, already
  used by `landing-nav.tsx`) for focus management and outside-click.
- `components/notifications/notification-item.tsx` — avatar, message, relative
  time; click marks read and navigates.
- `BellIcon` added to `components/icons/`, per the icon-library convention.
- `lib/utils/relative-time.ts` → `formatRelativeTime(iso)` producing `3s`,
  `5m`, `2h`, `4d`. Seconds under a minute, minutes under an hour, hours under
  a day, days above that with no upper unit.

Because reads are per-click, a notification nobody clicks never expires. The
dropdown therefore carries a **"Mark all as read"** action as the escape valve;
without it an ignored feed grows without bound.

### Deep link

Clicking routes to `/boards/<boardId>?task=<taskId>`. The board page already
renders `TaskDetailModal` from a `selectedTask` value held in the UI store, so
this is one `useSearchParams` effect that resolves the `task` param against the
loaded board and calls the existing setter. No restructuring of the board page.

## Retention

`sweepExpiredNotifications(prisma)` is a plain exported function:

```ts
await prisma.notification.deleteMany({ where: { deleteAt: { lte: new Date() } } });
```

`ws-server` calls it once at startup and then on a 24-hour interval, cleared in
the existing `shutdown()` alongside the heartbeat. Running at startup matters:
a container that restarts more often than daily would otherwise never sweep.

`ws-server` already imports Prisma transitively (`lib/auth/tokens.ts` →
`@/lib/prisma`), so this adds no new dependency to its esbuild bundle.

Extracting the function from the interval is what makes the predicate
unit-testable without waiting on a timer.

### End of the ISO week

```ts
/** End of the ISO week (Sunday 23:59:59.999 UTC) containing `at`. */
export function endOfIsoWeek(at: Date): Date {
  const d = new Date(at);
  const day = d.getUTCDay();                    // 0 = Sunday … 6 = Saturday
  d.setUTCDate(d.getUTCDate() + (day === 0 ? 0 : 7 - day));
  d.setUTCHours(23, 59, 59, 999);
  return d;
}
```

UTC throughout, matching the server's clock. A consequence worth stating: a
notification read on Sunday evening lives only a few hours, while one read on
Monday morning lives nearly seven days. That is inherent to calendar-week
retention rather than a defect.

## Testing

| Layer | Coverage |
|---|---|
| Unit (node) | `formatRelativeTime` unit boundaries; `endOfIsoWeek` across all seven weekdays including the Sunday edge; `format` per notification type; `recipients` fan-out, actor exclusion, and deduplication |
| Integration (mocked Prisma) | the three routes; cursor paging; `unreadCount`; a cross-user mark-read attempt returning 404 |
| Component (happy-dom) | bell renders five items; badge reflects `unreadCount`; "Load more" appends; clicking marks read and navigates; empty state |

Integration tests mock `@/lib/prisma` and `next-auth/next` rather than touching
a database, following the existing suite.

## Rejected

**Polling the feed on an interval.** Real-time delivery was an explicit
requirement, and a `refetchInterval` puts a constant query load on Postgres for
users with an empty feed.

**Reusing the board room and filtering client-side.** Broadcasting a
notification on `board:<id>` would deliver every member's notifications to every
other member — a straight privacy leak — and would still deliver nothing on the
dashboard, where no board is joined.

**Task-move notifications.** Board activity fans out to every member, so on a
ten-member board a single drag would write ten rows and publish ten messages.
Most drags are reordering within a column, which carries no information anyone
needs. There is deliberately no `BOARD_TASK_MOVED` notification type — that
removes the app's highest-frequency write from the notification path. Moves are
still a *sync* event (`task:moved`), which is where they belong.

**Storing a rendered message string.** Freezes wording at write time and turns
any copy change into a migration.

## Open risk

Board activity (`BOARD_TASK_ADDED`, `BOARD_TASK_REMOVED`) still fans out to the
whole board. Creating and deleting tasks is far rarer than dragging them, so the
volume is a small fraction of what a move notification would have produced, but
this is the first thing to revisit if the feed proves noisy in use.
