# User Profile Settings — Design

**Date:** 2026-09-07
**Status:** Approved for planning

## Goal

Give every user one place to manage their own account: change their display
name, choose which notifications they receive, pick a UI theme, sign out, and
delete the account permanently.

## Confirmed decisions

These were settled during brainstorming and are not open questions.

1. **Deleting an account cascades.** Boards the user owns are destroyed along
   with the account, whether or not other people are members. Collaborators
   lose those boards. The confirmation dialog says so explicitly; nothing
   blocks or transfers. See "Accepted consequences".
2. **Notification preferences are one toggle per `NotificationType`** — six
   switches today, stored as a muted-types array so the default is
   "everything on".
3. **Theme stays local.** `next-themes` keeps writing to `localStorage`; the
   settings page only surfaces the existing choice as a proper three-way
   control. No `User.theme` column, no cookie, no cross-device sync.
4. **Settings are tab sub-routes** under `/settings`, not a modal and not a
   single stacked page.
5. **Deleting requires re-authentication.** Users with a password re-enter it;
   OAuth-only users type their email address instead.

## Data model

One new column, one migration:

```prisma
model User {
  // ...existing fields...
  mutedNotificationTypes NotificationType[] @default([])
}
```

### Why an enum array and not a preferences table

An empty array means "no preferences expressed", which is exactly the desired
default — every notification on. A `NotificationPreference` table would need
six rows per user to say the same nothing, plus a backfill for existing users
and another for every future `NotificationType`. With the array, a new type is
on-by-default for free, because no existing row can mention it.

A `Json` blob would work equally well at write time but gives up database-level
validation: Postgres rejects an enum value that is not in `NotificationType`,
whereas JSON would happily store `"TASK_DELETD"` forever.

### Why mute-list rather than allow-list

Storing what the user turned *off* means the absence of data is the permissive
default. An allow-list would make a user with no row receive nothing, so every
account would need seeding at registration and a backfill migration — and any
bug in that seeding silently mutes people.

## Notification filtering

The filter belongs in `resolveRecipients` (`lib/notifications/recipients.ts`),
as the final step after the actor is excluded and the candidate list is
deduplicated:

```ts
const allowed = await prisma.user.findMany({
  where: { id: { in: candidates }, NOT: { mutedNotificationTypes: { has: event.type } } },
  select: { id: true },
});
return allowed.map((u) => u.id);
```

### Why there and not anywhere else

`resolveRecipients` is the single choke point every notification already passes
through, so one implementation covers all six types and any future one. Placing
it here means muted rows are never written at all — which keeps the unread
count correct with no extra logic, leaves nothing to filter at read time, and
keeps `notify()` untouched.

The alternative — writing every row and hiding muted ones in
`GET /api/notifications` — would inflate the table with rows nobody can see and
force every count query to learn about preferences.

Cost is one additional query per notification event, on a path that already
performs two or three.

## API surface

A new `app/api/user/` namespace. Every handler is wrapped in `withAuth` and
scoped to the session's own `userId`; there is no route by which one user
reaches another's account.

### `GET /api/user`

```json
{ "id": "...", "name": "Ada", "email": "ada@example.com", "image": null,
  "hasPassword": true, "mutedNotificationTypes": ["BOARD_TASK_ADDED"],
  "ownedBoardsWithMembers": 2 }
```

One fetch serves all four tabs. `ownedBoardsWithMembers` counts the boards this
user owns that have at least one other member — the number the delete
confirmation quotes back at them. `hasPassword` is `user.password !== null` — the
hash itself is never returned. It tells the delete form which confirmation to
demand without the client having to guess from the provider.

### `PATCH /api/user`

Body `{ name }`. Trims, then rejects empty, whitespace-only, or longer than 50
characters with a 400, mirroring the board-title validation in
`app/api/boards/route.ts`. Returns the updated `{ id, name, email, image }`.

### `PUT /api/user/notification-preferences`

Body `{ mutedTypes: NotificationType[] }`. Every element is validated against
the enum; an unknown value is a 400 for the whole request rather than a silent
drop. `PUT` rather than `PATCH` because it replaces the entire array — two
rapid toggles cannot interleave into a half-written state, and a retry is
harmless.

### `DELETE /api/user`

Body `{ password }` or `{ confirmEmail }`, chosen by whether the account has a
password:

- `user.password !== null` → `verifyPassword(body.password, user.password)`
  must pass.
- otherwise → `body.confirmEmail` must equal `user.email`, compared
  case-insensitively.

A failed check is a 401 and no deletion. On success, `prisma.user.delete()`.

The route takes a second, stricter rate limit on top of the guard's 60/min
per-IP: `rateLimit('account-delete:<userId>', { limit: 5, windowSeconds: 3600 })`.
Without it the endpoint is an unthrottled password oracle for anyone holding a
stolen session cookie.

## Accepted consequences of cascade deletion

`prisma.user.delete()` propagates through the existing schema:

| Relation | Behaviour |
|---|---|
| `Account`, `Session`, `RefreshToken` | deleted |
| `BoardMember` (their memberships) | deleted |
| `Comment` (theirs) | deleted |
| `Notification` (received) | deleted |
| `Notification.actorId` (sent) | set null — the notice survives, attributed to its `actorName` snapshot |
| `Board` they own | **deleted**, and with it every `Column`, `Task` and `Comment` on it, including other people's |
| `Task.assigneeId` on other people's boards | set null |

The third-to-last row is the one with teeth: a teammate can lose a shared board
because someone else closed their account, with no warning and no recovery. This
was chosen deliberately over transferring ownership or blocking deletion. The
confirmation dialog mitigates it only by informing the person doing the
deleting — it names the boards and how many members lose them.

### Known limitation: stateless sessions outlive the account

Sessions are JWTs, so a deleted user's other open tabs hold a nominally valid
token for up to the 15-minute access-token lifetime. Their refresh tokens are
gone with the cascade, so the next rotation fails, yields `RefreshTokenError`,
and `middleware.ts` redirects to sign-in. In the gap, their API calls fail on
missing rows rather than a clean 401.

Closing the gap properly means a per-request session-revocation check — a
database round trip on every authenticated request — which is not worth it for
a window this short. Documented, not fixed.

## Session propagation for the name change

`PATCH /api/user` writes the database; the client then calls
`useSession().update()` so the navbar reflects the new name without a reload.

This requires a change to the `jwt` callback in `lib/auth/auth-options.ts`. The
callback currently returns `token` unchanged whenever the access token is still
fresh, which would swallow the update. A new branch runs **before** that early
return:

```ts
if (trigger === 'update') {
  const fresh = await prisma.user.findUnique({
    where: { id: token.id },
    select: { name: true },
  });
  token.name = fresh?.name ?? token.name;
}
```

### Why re-read rather than trust the payload

The `session` argument NextAuth passes on an update trigger is supplied by the
client. Trusting it would let a user write an arbitrary display name into their
own JWT without it ever existing in the database. The damage is limited — the
name is only echoed back to them, and `actorName` snapshots are read from the
database by the routes that write notifications — but one indexed lookup buys an
authoritative value instead of a self-asserted one.

Old notifications keep the old name. `actorName` is a deliberate snapshot so a
notification outlives its subject; renaming does not rewrite history. Board
member lists read live and correct themselves on the next refetch.

## Client and UI

### Routes

```
app/settings/layout.tsx             shared header + tab nav
app/settings/page.tsx               redirect('/settings/profile')
app/settings/profile/page.tsx       name; email and avatar read-only
app/settings/notifications/page.tsx six toggles
app/settings/appearance/page.tsx    System / Light / Dark
app/settings/account/page.tsx       log out; danger zone
```

`middleware.ts` already lists `/settings/:path*` as protected — no change
needed. The layout is a client component using `usePathname` to mark the active
tab.

### Data

A single `useAccount()` hook over `GET /api/user`, keyed `queryKeys.account =
['account']` in the existing `queryKeys` factory, with `accountApi` added to
`lib/api.ts` alongside the other resource objects. Because all four tabs read
one cached query, switching tabs costs no fetch.

Mutations follow the established shape in `lib/hooks/use-queries.ts`:
`useUpdateAccountName`, `useUpdateNotificationPreferences`, `useDeleteAccount`,
each invalidating `queryKeys.account` and surfacing failures through `toast.error`.

### Navbar

The bare "Sign out" button becomes an avatar dropdown holding **Settings** and
**Log out**. Log out appears both there and on the Account tab; both call
`signOut({ callbackUrl: '/' })`.

### Icons

Three new glyphs in `components/icons/`, re-exported from the barrel:
`MonitorIcon` (the System theme option), `SettingsIcon`, `LogOutIcon`. No inline
`<svg>` in the settings components.

### Notification toggles

Each switch updates local state and issues the whole-array `PUT`, applied
optimistically with rollback on error. The optimistic update matters here
because a switch that visibly lags a round trip reads as broken.

### Appearance

A three-way segmented control calling `setTheme('system' | 'light' | 'dark')`.
It needs the same `mounted` guard as the existing `ThemeToggle`: before
hydration the resolved theme is unknown, and rendering a selection anyway marks
the wrong option as active.

### Delete flow

The danger zone opens a `Modal` that names what will be destroyed, including
how many boards the user owns that have other members. The input is a password
field when `hasPassword` is true and an email field otherwise; submit stays
disabled until it is non-empty. Success calls `signOut({ callbackUrl: '/' })`;
a 401 keeps the modal open with an inline error rather than a toast, so the
message sits next to the field that caused it.

The count of affected boards comes from `GET /api/user` — extending its
response with `ownedBoardsWithMembers: number` avoids a second endpoint.

## Testing

**Unit** — `tests/unit/notification-recipients.test.ts` gains cases: a muted
recipient is filtered out, an unmuted one survives, and muting one type does not
suppress another.

**Integration** — new `tests/integration/user-routes.test.ts`, following the
`@/lib/prisma` and `next-auth/next` mocking pattern of
`notification-routes.test.ts`:

- `PATCH` rejects empty, whitespace-only, and over-length names
- `PATCH` trims and persists a valid name
- `PUT` rejects a value outside `NotificationType`
- `PUT` replaces the whole array
- `DELETE` succeeds with the correct password
- `DELETE` returns 401 for a wrong password and does not delete
- `DELETE` accepts a matching email for an OAuth-only user
- `DELETE` returns 401 for a mismatched email

**Component** (happy-dom) — the toggle list renders initial state from
`mutedNotificationTypes` and calls the mutation on change; the delete modal
demands a password when `hasPassword` is true and an email when it is false.

**E2E** — one spec: register a throwaway user, rename them, assert the navbar
updates, then delete the account, assert the redirect to `/`, and assert that
signing in with those credentials now fails. The destructive path is worth
exercising end-to-end and a disposable account makes it safe.

## Rejected

**Transferring board ownership on deletion.** Would have spared collaborators,
but needs ownership-transfer machinery in `rbac.ts` and a rule for picking the
heir. Explicitly declined in favour of cascade.

**Blocking deletion while the user owns shared boards.** Safe, but leaves people
unable to close their account without a cleanup chore.

**Grouped notification categories.** Fewer switches, but the grouping becomes a
second mapping to maintain as types are added.

**Persisting theme on the user or in a cookie.** Cross-device sync is not worth
either a flash of the wrong theme or an SSR cookie read.

**Avatar upload.** Out of scope; `image` stays read-only and OAuth-supplied.

**Email change.** Out of scope. It needs verification of the new address and
interacts with OAuth account linking — its own design.

**Password change.** Out of scope for the same reason: it needs current-password
re-entry and refresh-token family revocation, which is a separate piece of work.

## Open risk

The cascade is irreversible and there are no backups in the deployment
(`DEPLOYMENT.md` accepts this). A user who deletes their account destroys shared
boards for everyone on them, permanently. The confirmation dialog is the only
guard, and it is the guard we chose.
