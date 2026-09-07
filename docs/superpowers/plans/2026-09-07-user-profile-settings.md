# User Profile Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every user a `/settings` area where they can change their display name, mute individual notification types, pick a UI theme, log out, and permanently delete their account.

**Architecture:** Four tab sub-routes under `/settings` read one cached `GET /api/user` query. A new `app/api/user/` route namespace owns the account; notification preferences are a `NotificationType[]` mute-list on `User`, enforced at the single existing fan-out choke point in `resolveRecipients`. Theme stays client-only in `next-themes`. Deletion cascades through Prisma and signs the user out.

**Tech Stack:** Next.js 15 App Router, Prisma 7 (`@prisma/adapter-pg`), NextAuth (JWT strategy), React Query, Zustand, Tailwind CSS variables, Vitest (+ happy-dom for components), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-07-user-profile-settings-design.md` — read it before starting. It carries the reasoning this plan only summarises, and the accepted consequences of cascade deletion.

## Global Constraints

- All commands run from `apps/web` unless stated otherwise. `@/*` maps to `apps/web/*`.
- **Prisma Client must be regenerated after any schema change** (`npx prisma generate`) or lint, type-check and build all fail.
- Lint is `--max-warnings 0` and `eslint-plugin-only-warn` downgrades errors to warnings, so *any* lint finding fails the build. Husky runs `npm run lint` on commit.
- Icons live one-per-file in `components/icons/` and are re-exported from the barrel. Never inline an `<svg>` in a feature component.
- Server-side logging goes through `lib/logger.ts` (pino), never `console`.
- Component tests need `// @vitest-environment happy-dom` on **line 1**. Integration tests mock `@/lib/prisma` and `next-auth/next` rather than hitting a database.
- API handlers are wrapped in `withAuth` from `lib/auth/api-guard.ts` and throw rather than hand-rolling 401/403.
- Colour comes from CSS variables (`var(--foreground)`, `var(--muted)`, `var(--border)`, `var(--accent)`, `var(--destructive)`), never hard-coded hex.
- Postgres and Redis must be running for migrations: `docker-compose up -d` from the repo root.
- Display-name limit is **50 characters**, defined once as `MAX_NAME_LENGTH`.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `lib/account/validate-name.ts` | Pure display-name validation, shared by route and form |
| `app/api/user/route.ts` | `GET` / `PATCH` / `DELETE` on the signed-in account |
| `app/api/user/notification-preferences/route.ts` | `PUT` the muted-types array |
| `app/settings/layout.tsx` | Navbar + tab navigation shell |
| `app/settings/page.tsx` | Redirect to the profile tab |
| `app/settings/profile/page.tsx` | Name form |
| `app/settings/notifications/page.tsx` | Notification toggles tab |
| `app/settings/appearance/page.tsx` | Theme tab |
| `app/settings/account/page.tsx` | Log out + danger zone |
| `components/settings/profile-form.tsx` | Name form component |
| `components/settings/notification-toggles.tsx` | Six labelled switches |
| `components/settings/theme-selector.tsx` | System / Light / Dark control |
| `components/settings/delete-account-modal.tsx` | Confirmation dialog |
| `components/user-menu.tsx` | Navbar avatar dropdown |
| `components/icons/monitor-icon.tsx`, `settings-icon.tsx`, `log-out-icon.tsx` | New glyphs |

**Modified**

| File | Change |
|---|---|
| `prisma/schema.prisma` | `mutedNotificationTypes` on `User` |
| `lib/notifications/recipients.ts` | Filter muted recipients |
| `lib/auth/auth-options.ts` | Honour the `update` JWT trigger |
| `lib/types.ts` | Account request/response types |
| `lib/api.ts` | `accountApi` |
| `lib/hooks/use-queries.ts` | `queryKeys.account` + four hooks |
| `components/navbar.tsx` | Sign-out button becomes the avatar dropdown |
| `components/icons/index.ts` | Export the three new icons |

---

### Task 1: Mute-list column and recipient filtering

**Files:**
- Modify: `apps/web/prisma/schema.prisma`
- Modify: `apps/web/lib/notifications/recipients.ts:53-77`
- Test: `apps/web/tests/unit/notification-recipients.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `User.mutedNotificationTypes: NotificationType[]` (Prisma), and a `resolveRecipients` that returns only unmuted recipients. Signature is unchanged: `resolveRecipients(event: NotifyEvent, actorId: string): Promise<string[]>`.

- [ ] **Step 1: Add the user mock and its permissive default to the existing test file**

The suite currently mocks only `board`, `task` and `comment`. Once `resolveRecipients` queries `user`, every existing test would return `[]` without a default that echoes candidates back. Replace the mock block and `beforeEach` at the top of `apps/web/tests/unit/notification-recipients.test.ts`:

```ts
const mockPrisma = {
  board: { findUnique: vi.fn() },
  task: { findUnique: vi.fn() },
  comment: { findMany: vi.fn() },
  user: { findMany: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

const { resolveRecipients } = await import('@/lib/notifications/recipients');

beforeEach(() => {
  vi.clearAllMocks();
  // Default: nobody has muted anything, so every candidate comes back.
  mockPrisma.user.findMany.mockImplementation(
    (args: { where: { id: { in: string[] } } }) =>
      Promise.resolve(args.where.id.in.map((id) => ({ id }))),
  );
});
```

- [ ] **Step 2: Write the failing tests**

Append to the `describe('resolveRecipients')` block:

```ts
it('drops a recipient who has muted the event type', async () => {
  mockPrisma.user.findMany.mockResolvedValue([]);

  const result = await resolveRecipients(
    { type: 'TASK_ASSIGNED', assigneeId: 'user-2' },
    'user-1',
  );

  expect(result).toEqual([]);
  expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
    where: {
      id: { in: ['user-2'] },
      NOT: { mutedNotificationTypes: { has: 'TASK_ASSIGNED' } },
    },
    select: { id: true },
  });
});

it('filters on the event type being delivered, not a fixed one', async () => {
  mockPrisma.task.findUnique.mockResolvedValue({ assigneeId: 'user-2' });
  mockPrisma.comment.findMany.mockResolvedValue([]);

  await resolveRecipients({ type: 'TASK_COMMENTED', taskId: 'task-1' }, 'user-1');

  expect(mockPrisma.user.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        NOT: { mutedNotificationTypes: { has: 'TASK_COMMENTED' } },
      }),
    }),
  );
});

it('preserves candidate order regardless of the order rows come back in', async () => {
  mockPrisma.board.findUnique.mockResolvedValue({
    ownerId: 'user-2',
    members: [{ userId: 'user-3' }, { userId: 'user-4' }],
  });
  mockPrisma.user.findMany.mockResolvedValue([
    { id: 'user-4' },
    { id: 'user-2' },
    { id: 'user-3' },
  ]);

  const result = await resolveRecipients(
    { type: 'BOARD_TASK_ADDED', boardId: 'board-1' },
    'user-1',
  );

  expect(result).toEqual(['user-2', 'user-3', 'user-4']);
});

it('does not query preferences when there are no candidates', async () => {
  const result = await resolveRecipients(
    { type: 'TASK_ASSIGNED', assigneeId: null },
    'user-1',
  );

  expect(result).toEqual([]);
  expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd apps/web && npx vitest run tests/unit/notification-recipients.test.ts`
Expected: FAIL — the four new tests fail because `prisma.user.findMany` is never called (the first reports `[ 'user-2' ]` instead of `[]`).

- [ ] **Step 4: Add the column to the schema**

In `apps/web/prisma/schema.prisma`, inside `model User`, immediately after the `image` field:

```prisma
  // Notification types this user has switched off. Empty means "everything on",
  // so a new NotificationType is on by default with no backfill.
  mutedNotificationTypes NotificationType[]
```

Prisma scalar-list fields on Postgres default to an empty list; no `@default` is needed or allowed here.

- [ ] **Step 5: Create the migration and regenerate the client**

```bash
docker-compose up -d
cd apps/web && npx prisma migrate dev --name add_muted_notification_types && npx prisma generate
```

Expected: a new folder under `apps/web/prisma/migrations/` and "Generated Prisma Client".

- [ ] **Step 6: Implement the filter**

Replace the final line of `resolveRecipients` in `apps/web/lib/notifications/recipients.ts` (currently `return [...new Set(candidates)].filter((id) => id !== actorId);`) with:

```ts
  const recipients = [...new Set(candidates)].filter((id) => id !== actorId);
  if (recipients.length === 0) return [];

  // Preferences are applied here rather than at read time so a muted
  // notification is never written at all — which keeps unread counts correct
  // without teaching every count query about preferences.
  const allowed = await prisma.user.findMany({
    where: {
      id: { in: recipients },
      NOT: { mutedNotificationTypes: { has: event.type } },
    },
    select: { id: true },
  });

  // Filter the candidate list rather than mapping the rows: the database does
  // not promise an order, and callers rely on recipient order being stable.
  const allowedIds = new Set(allowed.map((u) => u.id));
  return recipients.filter((id) => allowedIds.has(id));
```

Also extend the function's doc comment above it with a sentence: `Recipients who have muted the event's type are removed last.`

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/unit/notification-recipients.test.ts`
Expected: PASS — all tests, old and new.

- [ ] **Step 8: Commit**

```bash
git add apps/web/prisma/schema.prisma apps/web/prisma/migrations apps/web/lib/notifications/recipients.ts apps/web/tests/unit/notification-recipients.test.ts
git commit -m "feat: let users mute notification types"
```

---

### Task 2: Account profile endpoint (GET + PATCH)

**Files:**
- Create: `apps/web/lib/account/validate-name.ts`
- Create: `apps/web/app/api/user/route.ts`
- Test: `apps/web/tests/unit/validate-account-name.test.ts`
- Test: `apps/web/tests/integration/user-routes.test.ts`

**Interfaces:**
- Consumes: `User.mutedNotificationTypes` from Task 1.
- Produces:
  - `MAX_NAME_LENGTH: 50` and `validateAccountName(input: unknown): { ok: true; name: string } | { ok: false; error: string }` from `@/lib/account/validate-name`.
  - `GET /api/user` → `{ id, name, email, image, hasPassword, mutedNotificationTypes, ownedBoardsWithMembers }`.
  - `PATCH /api/user` with `{ name }` → `{ id, name, email, image }`.

- [ ] **Step 1: Write the failing validator test**

Create `apps/web/tests/unit/validate-account-name.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateAccountName, MAX_NAME_LENGTH } from '@/lib/account/validate-name';

describe('validateAccountName', () => {
  it('accepts a normal name', () => {
    expect(validateAccountName('Ada')).toEqual({ ok: true, name: 'Ada' });
  });

  it('trims surrounding whitespace', () => {
    expect(validateAccountName('  Ada  ')).toEqual({ ok: true, name: 'Ada' });
  });

  it('rejects an empty string', () => {
    expect(validateAccountName('')).toEqual({ ok: false, error: 'Name is required' });
  });

  it('rejects a whitespace-only name rather than storing blanks', () => {
    expect(validateAccountName('   ')).toEqual({ ok: false, error: 'Name is required' });
  });

  it('rejects a non-string', () => {
    expect(validateAccountName(42)).toEqual({ ok: false, error: 'Name is required' });
  });

  it('accepts a name of exactly the maximum length', () => {
    const name = 'a'.repeat(MAX_NAME_LENGTH);
    expect(validateAccountName(name)).toEqual({ ok: true, name });
  });

  it('rejects a name one character over the maximum', () => {
    expect(validateAccountName('a'.repeat(MAX_NAME_LENGTH + 1))).toEqual({
      ok: false,
      error: 'Name must be 50 characters or fewer',
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && npx vitest run tests/unit/validate-account-name.test.ts`
Expected: FAIL — cannot resolve `@/lib/account/validate-name`.

- [ ] **Step 3: Implement the validator**

Create `apps/web/lib/account/validate-name.ts`:

```ts
/** Longest display name we store. Also the form input's `maxLength`. */
export const MAX_NAME_LENGTH = 50;

export type NameValidation =
  | { ok: true; name: string }
  | { ok: false; error: string };

/**
 * Validates a display name submitted to PATCH /api/user.
 *
 * Trimming lives here rather than at the call site so the route and the
 * settings form agree on what "empty" means — a name of only spaces is
 * rejected, not stored as blanks.
 */
export function validateAccountName(input: unknown): NameValidation {
  if (typeof input !== 'string') {
    return { ok: false, error: 'Name is required' };
  }

  const name = input.trim();

  if (name.length === 0) {
    return { ok: false, error: 'Name is required' };
  }

  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `Name must be ${MAX_NAME_LENGTH} characters or fewer` };
  }

  return { ok: true, name };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/web && npx vitest run tests/unit/validate-account-name.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Write the failing route tests**

Create `apps/web/tests/integration/user-routes.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  board: { count: vi.fn() },
};

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));

// Mutable so each test can use a distinct user id. Deletion is rate limited
// per user, so reusing one id across the DELETE cases would trip the limiter.
const session = { user: { id: 'user-1', email: 'ada@example.com', name: 'Ada' } };

vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn(() => Promise.resolve(session)),
}));

vi.mock('@/lib/auth/auth-options', () => ({ authOptions: {} }));

beforeEach(() => {
  vi.clearAllMocks();
  session.user.id = 'user-1';
});

const ctx = { params: Promise.resolve({}) } as never;

describe('GET /api/user', () => {
  it('returns the account without ever exposing the password hash', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Ada',
      email: 'ada@example.com',
      image: null,
      password: 'hashed-secret',
      mutedNotificationTypes: ['BOARD_TASK_ADDED'],
    });
    mockPrisma.board.count.mockResolvedValue(2);

    const { GET } = await import('@/app/api/user/route');
    const res = await GET(new Request('http://localhost/api/user') as never, ctx);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      id: 'user-1',
      name: 'Ada',
      email: 'ada@example.com',
      image: null,
      hasPassword: true,
      mutedNotificationTypes: ['BOARD_TASK_ADDED'],
      ownedBoardsWithMembers: 2,
    });
    expect(JSON.stringify(body)).not.toContain('hashed-secret');
  });

  it('reports hasPassword false for an OAuth-only account', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Ada',
      email: 'ada@example.com',
      image: null,
      password: null,
      mutedNotificationTypes: [],
    });
    mockPrisma.board.count.mockResolvedValue(0);

    const { GET } = await import('@/app/api/user/route');
    const res = await GET(new Request('http://localhost/api/user') as never, ctx);

    expect((await res.json()).hasPassword).toBe(false);
  });

  it('counts only owned boards that have another member on them', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      name: 'Ada',
      email: 'ada@example.com',
      image: null,
      password: null,
      mutedNotificationTypes: [],
    });
    mockPrisma.board.count.mockResolvedValue(0);

    const { GET } = await import('@/app/api/user/route');
    await GET(new Request('http://localhost/api/user') as never, ctx);

    expect(mockPrisma.board.count).toHaveBeenCalledWith({
      where: { ownerId: 'user-1', members: { some: { userId: { not: 'user-1' } } } },
    });
  });
});

describe('PATCH /api/user', () => {
  it('trims and persists a valid name', async () => {
    mockPrisma.user.update.mockResolvedValue({
      id: 'user-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      image: null,
    });

    const { PATCH } = await import('@/app/api/user/route');
    const res = await PATCH(
      new Request('http://localhost/api/user', {
        method: 'PATCH',
        body: JSON.stringify({ name: '  Ada Lovelace  ' }),
      }) as never,
      ctx,
    );

    expect(res.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'Ada Lovelace' },
      select: { id: true, name: true, email: true, image: true },
    });
  });

  it.each([
    ['an empty name', ''],
    ['a whitespace-only name', '   '],
    ['an over-length name', 'a'.repeat(51)],
  ])('rejects %s without writing', async (_label, name) => {
    const { PATCH } = await import('@/app/api/user/route');
    const res = await PATCH(
      new Request('http://localhost/api/user', {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      }) as never,
      ctx,
    );

    expect(res.status).toBe(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `cd apps/web && npx vitest run tests/integration/user-routes.test.ts`
Expected: FAIL — cannot resolve `@/app/api/user/route`.

- [ ] **Step 7: Implement the route**

Create `apps/web/app/api/user/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/api-guard';
import { validateAccountName } from '@/lib/account/validate-name';

/**
 * GET /api/user
 *
 * The signed-in user's own account, shaped for the settings tabs. One fetch
 * serves all four of them.
 *
 * No RBAC check — every field is scoped to the session's own userId, so there
 * is no route by which one user reaches another's account.
 */
export const GET = withAuth(async (_req, { userId }) => {
  const [user, ownedBoardsWithMembers] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        password: true,
        mutedNotificationTypes: true,
      },
    }),
    // Boards this user owns that someone else would lose if they deleted their
    // account. The owner has no BoardMember row of their own, but the `not`
    // guard keeps the count right even if one is ever added.
    prisma.board.count({
      where: { ownerId: userId, members: { some: { userId: { not: userId } } } },
    }),
  ]);

  if (!user) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  // Built field by field rather than spread: the row carries the password hash
  // and it must never reach the client.
  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    hasPassword: user.password !== null,
    mutedNotificationTypes: user.mutedNotificationTypes,
    ownedBoardsWithMembers,
  });
});

/**
 * PATCH /api/user
 * Body: { name: string }
 */
export const PATCH = withAuth(async (req, { userId }) => {
  const body = (await req.json()) as { name?: unknown };
  const result = validateAccountName(body.name);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { name: result.name },
    select: { id: true, name: true, email: true, image: true },
  });

  return NextResponse.json(user);
});
```

- [ ] **Step 8: Run them to verify they pass**

Run: `cd apps/web && npx vitest run tests/integration/user-routes.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/account apps/web/app/api/user apps/web/tests/unit/validate-account-name.test.ts apps/web/tests/integration/user-routes.test.ts
git commit -m "feat: add account profile endpoint"
```

---

### Task 3: Notification preferences endpoint

**Files:**
- Create: `apps/web/app/api/user/notification-preferences/route.ts`
- Test: `apps/web/tests/integration/user-routes.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `User.mutedNotificationTypes` from Task 1.
- Produces: `PUT /api/user/notification-preferences` with `{ mutedTypes: NotificationType[] }` → `{ mutedNotificationTypes: NotificationType[] }`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/tests/integration/user-routes.test.ts`:

```ts
describe('PUT /api/user/notification-preferences', () => {
  function request(body: unknown) {
    return new Request('http://localhost/api/user/notification-preferences', {
      method: 'PUT',
      body: JSON.stringify(body),
    }) as never;
  }

  it('replaces the whole muted array', async () => {
    mockPrisma.user.update.mockResolvedValue({
      mutedNotificationTypes: ['TASK_COMMENTED', 'BOARD_TASK_ADDED'],
    });

    const { PUT } = await import('@/app/api/user/notification-preferences/route');
    const res = await PUT(
      request({ mutedTypes: ['TASK_COMMENTED', 'BOARD_TASK_ADDED'] }),
      ctx,
    );

    expect(res.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { mutedNotificationTypes: ['TASK_COMMENTED', 'BOARD_TASK_ADDED'] },
      select: { mutedNotificationTypes: true },
    });
  });

  it('accepts an empty array as "mute nothing"', async () => {
    mockPrisma.user.update.mockResolvedValue({ mutedNotificationTypes: [] });

    const { PUT } = await import('@/app/api/user/notification-preferences/route');
    const res = await PUT(request({ mutedTypes: [] }), ctx);

    expect(res.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { mutedNotificationTypes: [] } }),
    );
  });

  it('deduplicates repeated types', async () => {
    mockPrisma.user.update.mockResolvedValue({ mutedNotificationTypes: ['TASK_ASSIGNED'] });

    const { PUT } = await import('@/app/api/user/notification-preferences/route');
    await PUT(request({ mutedTypes: ['TASK_ASSIGNED', 'TASK_ASSIGNED'] }), ctx);

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { mutedNotificationTypes: ['TASK_ASSIGNED'] } }),
    );
  });

  it('rejects a value outside the enum without writing', async () => {
    const { PUT } = await import('@/app/api/user/notification-preferences/route');
    const res = await PUT(request({ mutedTypes: ['TASK_DELETD'] }), ctx);

    expect(res.status).toBe(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects a non-array body without writing', async () => {
    const { PUT } = await import('@/app/api/user/notification-preferences/route');
    const res = await PUT(request({ mutedTypes: 'TASK_ASSIGNED' }), ctx);

    expect(res.status).toBe(400);
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/web && npx vitest run tests/integration/user-routes.test.ts`
Expected: FAIL — cannot resolve `@/app/api/user/notification-preferences/route`.

- [ ] **Step 3: Implement the route**

Create `apps/web/app/api/user/notification-preferences/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth/api-guard';
import type { NotificationType } from '@/lib/types';

const NOTIFICATION_TYPES: NotificationType[] = [
  'TASK_ASSIGNED',
  'TASK_COMMENTED',
  'BOARD_INVITED',
  'BOARD_ROLE_CHANGED',
  'BOARD_TASK_ADDED',
  'BOARD_TASK_REMOVED',
];

function isNotificationType(value: unknown): value is NotificationType {
  return NOTIFICATION_TYPES.includes(value as NotificationType);
}

/**
 * PUT /api/user/notification-preferences
 * Body: { mutedTypes: NotificationType[] }
 *
 * PUT rather than PATCH because it replaces the entire array: two switches
 * flipped in quick succession cannot interleave into a half-written state, and
 * a retry of the same body is harmless.
 *
 * An unrecognised type fails the whole request rather than being dropped
 * silently — a typo in a client build should be loud, not a preference that
 * quietly never applies.
 */
export const PUT = withAuth(async (req, { userId }) => {
  const body = (await req.json()) as { mutedTypes?: unknown };

  if (!Array.isArray(body.mutedTypes) || !body.mutedTypes.every(isNotificationType)) {
    return NextResponse.json(
      { error: 'mutedTypes must be an array of notification types' },
      { status: 400 },
    );
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data: { mutedNotificationTypes: [...new Set(body.mutedTypes)] },
    select: { mutedNotificationTypes: true },
  });

  return NextResponse.json(user);
});
```

- [ ] **Step 4: Run them to verify they pass**

Run: `cd apps/web && npx vitest run tests/integration/user-routes.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/user/notification-preferences apps/web/tests/integration/user-routes.test.ts
git commit -m "feat: add notification preferences endpoint"
```

---

### Task 4: Account deletion endpoint

**Files:**
- Modify: `apps/web/app/api/user/route.ts` (append `DELETE`)
- Test: `apps/web/tests/integration/user-routes.test.ts` (append a describe block)

**Interfaces:**
- Consumes: `verifyPassword` from `@/lib/auth/password`, `rateLimit` from `@/lib/rate-limit`, `logger` from `@/lib/logger`.
- Produces: `DELETE /api/user` with `{ password }` or `{ confirmEmail }` → `{ message: 'Account deleted' }`, 401 on failed confirmation, 429 when the per-user attempt limit is exceeded.

- [ ] **Step 1: Write the failing tests**

Append to `apps/web/tests/integration/user-routes.test.ts`. Note the `verifyPassword` mock must be added at the top of the file, next to the other `vi.mock` calls:

```ts
vi.mock('@/lib/auth/password', () => ({
  verifyPassword: vi.fn((plain: string, hash: string) => Promise.resolve(hash === `hashed:${plain}`)),
}));
```

Then the block:

```ts
describe('DELETE /api/user', () => {
  function request(body: unknown) {
    return new Request('http://localhost/api/user', {
      method: 'DELETE',
      body: JSON.stringify(body),
    }) as never;
  }

  it('deletes the account when the password is correct', async () => {
    session.user.id = 'delete-ok';
    mockPrisma.user.findUnique.mockResolvedValue({
      email: 'ada@example.com',
      password: 'hashed:CorrectHorse1!',
    });
    mockPrisma.user.delete.mockResolvedValue({});

    const { DELETE } = await import('@/app/api/user/route');
    const res = await DELETE(request({ password: 'CorrectHorse1!' }), ctx);

    expect(res.status).toBe(200);
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 'delete-ok' } });
  });

  it('refuses a wrong password and deletes nothing', async () => {
    session.user.id = 'delete-wrong-password';
    mockPrisma.user.findUnique.mockResolvedValue({
      email: 'ada@example.com',
      password: 'hashed:CorrectHorse1!',
    });

    const { DELETE } = await import('@/app/api/user/route');
    const res = await DELETE(request({ password: 'WrongPassword1!' }), ctx);

    expect(res.status).toBe(401);
    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
  });

  it('accepts a matching email for an account with no password', async () => {
    session.user.id = 'delete-oauth';
    mockPrisma.user.findUnique.mockResolvedValue({
      email: 'ada@example.com',
      password: null,
    });
    mockPrisma.user.delete.mockResolvedValue({});

    const { DELETE } = await import('@/app/api/user/route');
    const res = await DELETE(request({ confirmEmail: '  ADA@example.com ' }), ctx);

    expect(res.status).toBe(200);
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({ where: { id: 'delete-oauth' } });
  });

  it('refuses a mismatched email and deletes nothing', async () => {
    session.user.id = 'delete-wrong-email';
    mockPrisma.user.findUnique.mockResolvedValue({
      email: 'ada@example.com',
      password: null,
    });

    const { DELETE } = await import('@/app/api/user/route');
    const res = await DELETE(request({ confirmEmail: 'someone@else.com' }), ctx);

    expect(res.status).toBe(401);
    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
  });

  it('refuses an email confirmation when the account has a password', async () => {
    session.user.id = 'delete-wrong-proof';
    mockPrisma.user.findUnique.mockResolvedValue({
      email: 'ada@example.com',
      password: 'hashed:CorrectHorse1!',
    });

    const { DELETE } = await import('@/app/api/user/route');
    const res = await DELETE(request({ confirmEmail: 'ada@example.com' }), ctx);

    expect(res.status).toBe(401);
    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
  });

  it('rate limits repeated failed attempts by the same user', async () => {
    session.user.id = 'delete-brute-force';
    mockPrisma.user.findUnique.mockResolvedValue({
      email: 'ada@example.com',
      password: 'hashed:CorrectHorse1!',
    });

    const { DELETE } = await import('@/app/api/user/route');
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await DELETE(request({ password: 'WrongPassword1!' }), ctx);
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });
});
```

Each test uses its own `session.user.id` because the delete limiter is keyed per user and its `Map` persists for the whole test file.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/web && npx vitest run tests/integration/user-routes.test.ts`
Expected: FAIL — `DELETE` is not exported from `@/app/api/user/route`.

- [ ] **Step 3: Implement the handler**

Add these imports to the top of `apps/web/app/api/user/route.ts`:

```ts
import { verifyPassword } from '@/lib/auth/password';
import { rateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
```

Append to the same file:

```ts
/**
 * DELETE /api/user
 * Body: { password: string } for credentials accounts,
 *       { confirmEmail: string } for OAuth-only accounts.
 *
 * Deletion cascades: the account, its sessions and refresh tokens, its
 * memberships and comments, and every board it owns — including boards shared
 * with other people, who lose them. That is the accepted design; see the spec.
 */
export const DELETE = withAuth(async (req, { userId }) => {
  // A second, much stricter limit on top of the guard's 60/min per IP. Without
  // it this endpoint is an unthrottled password oracle for a stolen session.
  const rl = rateLimit(`account-delete:${userId}`, { limit: 5, windowSeconds: 3600 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Please try again later.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
      },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, password: true },
  });

  if (!user) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    password?: unknown;
    confirmEmail?: unknown;
  };

  // Which proof is demanded depends on what the account has. An OAuth-only
  // user has no password to re-enter, so typing their own address is the
  // deliberate act instead.
  const confirmed = user.password
    ? typeof body.password === 'string' &&
      (await verifyPassword(body.password, user.password))
    : typeof body.confirmEmail === 'string' &&
      body.confirmEmail.trim().toLowerCase() === user.email.toLowerCase();

  if (!confirmed) {
    logger.warn({ userId }, 'Account deletion confirmation failed');
    return NextResponse.json({ error: 'Confirmation failed' }, { status: 401 });
  }

  await prisma.user.delete({ where: { id: userId } });
  logger.info({ userId }, 'Account deleted');

  return NextResponse.json({ message: 'Account deleted' });
});
```

- [ ] **Step 4: Run them to verify they pass**

Run: `cd apps/web && npx vitest run tests/integration/user-routes.test.ts`
Expected: PASS (18 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/user/route.ts apps/web/tests/integration/user-routes.test.ts
git commit -m "feat: add account deletion endpoint"
```

---

### Task 5: Propagate a renamed account into the session

**Files:**
- Modify: `apps/web/lib/auth/auth-options.ts:121-160`
- Test: `apps/web/tests/unit/auth-jwt-update.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: a `jwt` callback that, on `trigger === 'update'`, refreshes `token.name` from the database. Task 6's `useUpdateAccountName` depends on this.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/unit/auth-jwt-update.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPrisma = { user: { findUnique: vi.fn() } };

vi.mock('@/lib/prisma', () => ({ prisma: mockPrisma }));
vi.mock('@auth/prisma-adapter', () => ({ PrismaAdapter: () => ({}) }));
vi.mock('@/lib/auth/tokens', () => ({
  createRefreshToken: vi.fn(),
  rotateRefreshToken: vi.fn(),
}));

const { authOptions } = await import('@/lib/auth/auth-options');

beforeEach(() => {
  vi.clearAllMocks();
});

/* eslint-disable @typescript-eslint/no-explicit-any */
const jwt = authOptions.callbacks!.jwt! as (args: any) => Promise<any>;

function freshToken() {
  return {
    id: 'user-1',
    email: 'ada@example.com',
    name: 'Ada',
    // Still well inside the 15-minute access-token window, so the callback's
    // early return would otherwise skip any update.
    accessTokenExpires: Date.now() + 10 * 60 * 1000,
  };
}

describe('jwt callback — update trigger', () => {
  it('refreshes the name from the database on an update trigger', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ name: 'Ada Lovelace' });

    const result = await jwt({ token: freshToken(), trigger: 'update' });

    expect(result.name).toBe('Ada Lovelace');
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      select: { name: true },
    });
  });

  it('ignores a name supplied by the client and uses the stored one', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ name: 'Ada Lovelace' });

    const result = await jwt({
      token: freshToken(),
      trigger: 'update',
      session: { name: 'Administrator' },
    });

    expect(result.name).toBe('Ada Lovelace');
  });

  it('leaves the token alone when there is no update trigger', async () => {
    const result = await jwt({ token: freshToken() });

    expect(result.name).toBe('Ada');
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('keeps the existing name if the user row has vanished', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const result = await jwt({ token: freshToken(), trigger: 'update' });

    expect(result.name).toBe('Ada');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && npx vitest run tests/unit/auth-jwt-update.test.ts`
Expected: FAIL — the first two tests report `'Ada'`, because the callback returns early while the access token is fresh.

- [ ] **Step 3: Implement the update branch**

In `apps/web/lib/auth/auth-options.ts`, change the `jwt` callback signature to destructure `trigger`:

```ts
    async jwt({ token, user, account, trigger }): Promise<JWT> {
```

Then insert this block **after** the initial sign-in branch (`if (user && account) { ... }`) and **before** the `if (token.accessTokenExpires && Date.now() < token.accessTokenExpires)` early return:

```ts
      // A client-triggered update — the settings page renaming the account —
      // must be honoured even while the access token is still fresh, so this
      // runs before the early return below.
      //
      // The name is re-read from the database rather than taken from the
      // `session` argument, which is supplied by the client: trusting it would
      // let a user write an arbitrary display name into their own JWT without
      // it ever existing in the database.
      if (trigger === 'update' && token.id) {
        const fresh = await prisma.user.findUnique({
          where: { id: token.id },
          select: { name: true },
        });
        token.name = fresh?.name ?? token.name;
      }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/web && npx vitest run tests/unit/auth-jwt-update.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Check nothing else regressed**

Run: `cd apps/web && npx vitest run`
Expected: PASS — the whole unit/integration suite.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/auth/auth-options.ts apps/web/tests/unit/auth-jwt-update.test.ts
git commit -m "feat: refresh the session name on a jwt update trigger"
```

---

### Task 6: Client data layer

**Files:**
- Modify: `apps/web/lib/types.ts` (append after the notification types, around line 258)
- Modify: `apps/web/lib/api.ts` (append after `notificationsApi`)
- Modify: `apps/web/lib/hooks/use-queries.ts` (`queryKeys` at line 30, then append hooks)
- Test: `apps/web/tests/unit/account-api.test.ts`

**Interfaces:**
- Consumes: the four endpoints from Tasks 2–4.
- Produces:
  - Types `AccountProfile`, `UpdateAccountRequest`, `UpdateNotificationPreferencesRequest`, `DeleteAccountRequest`.
  - `accountApi.get()`, `accountApi.updateName(data)`, `accountApi.updateNotificationPreferences(data)`, `accountApi.remove(data)`.
  - `queryKeys.account`, and hooks `useAccount()`, `useUpdateAccountName()`, `useUpdateNotificationPreferences()`, `useDeleteAccount()`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/unit/account-api.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { accountApi } from '@/lib/api';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
});

describe('accountApi', () => {
  it('fetches the profile', async () => {
    await accountApi.get();
    expect(fetchMock).toHaveBeenCalledWith('/api/user', expect.objectContaining({}));
  });

  it('PATCHes a name change', async () => {
    await accountApi.updateName({ name: 'Ada' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/user',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ name: 'Ada' }) }),
    );
  });

  it('PUTs the whole muted array', async () => {
    await accountApi.updateNotificationPreferences({ mutedTypes: ['TASK_ASSIGNED'] });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/user/notification-preferences',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ mutedTypes: ['TASK_ASSIGNED'] }),
      }),
    );
  });

  it('DELETEs with the confirmation in the body', async () => {
    await accountApi.remove({ password: 'CorrectHorse1!' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/user',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ password: 'CorrectHorse1!' }),
      }),
    );
  });

  it('surfaces the server error message', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: 'Confirmation failed' }),
    });

    await expect(accountApi.remove({ password: 'nope' })).rejects.toThrow('Confirmation failed');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && npx vitest run tests/unit/account-api.test.ts`
Expected: FAIL — `accountApi` is not exported from `@/lib/api`.

- [ ] **Step 3: Add the types**

Append to `apps/web/lib/types.ts`, after the notification types and before the `// ─── API Request Types ───` divider:

```ts
// ─── Account ───────────────────────────────────────────────────────────────────

/** The signed-in user's own account, as returned by GET /api/user. */
export interface AccountProfile {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  /** False for OAuth-only accounts, which confirm deletion by email instead. */
  hasPassword: boolean;
  mutedNotificationTypes: NotificationType[];
  /** Boards this user owns that other people would lose on deletion. */
  ownedBoardsWithMembers: number;
}

export interface UpdateAccountRequest {
  name: string;
}

export interface UpdateNotificationPreferencesRequest {
  mutedTypes: NotificationType[];
}

/** Whichever proof the account supports — see AccountProfile.hasPassword. */
export type DeleteAccountRequest =
  | { password: string }
  | { confirmEmail: string };
```

- [ ] **Step 4: Add `accountApi`**

Add these names to the existing type import at the top of `apps/web/lib/api.ts`: `AccountProfile`, `UpdateAccountRequest`, `UpdateNotificationPreferencesRequest`, `DeleteAccountRequest`, `NotificationType`, `UserSummary`.

Append to the file:

```ts
// ─── Account ───────────────────────────────────────────────────────────────────

export const accountApi = {
  get: () => apiFetch<AccountProfile>('/api/user'),

  updateName: (data: UpdateAccountRequest) =>
    apiFetch<UserSummary>('/api/user', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  updateNotificationPreferences: (data: UpdateNotificationPreferencesRequest) =>
    apiFetch<{ mutedNotificationTypes: NotificationType[] }>(
      '/api/user/notification-preferences',
      { method: 'PUT', body: JSON.stringify(data) }
    ),

  remove: (data: DeleteAccountRequest) =>
    apiFetch<{ message: string }>('/api/user', {
      method: 'DELETE',
      body: JSON.stringify(data),
    }),
};
```

- [ ] **Step 5: Run it to verify it passes**

Run: `cd apps/web && npx vitest run tests/unit/account-api.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Add the query key and hooks**

In `apps/web/lib/hooks/use-queries.ts`, add to the `queryKeys` object:

```ts
  account: ['account'] as const,
```

Add to the imports at the top of the file:

```ts
import { signOut, useSession } from 'next-auth/react';
import { accountApi } from '@/lib/api';
import type {
  AccountProfile,
  DeleteAccountRequest,
  NotificationType,
} from '@/lib/types';
```

(Merge those into the existing `@/lib/api` and `@/lib/types` import statements rather than duplicating them.)

Append to the end of the file:

```ts
// ─── Account ───────────────────────────────────────────────────────────────────

export function useAccount() {
  return useQuery({
    queryKey: queryKeys.account,
    queryFn: accountApi.get,
  });
}

export function useUpdateAccountName() {
  const qc = useQueryClient();
  const { update } = useSession();

  return useMutation({
    mutationFn: (name: string) => accountApi.updateName({ name }),
    onSuccess: async () => {
      qc.invalidateQueries({ queryKey: queryKeys.account });
      // Refresh the JWT so the navbar shows the new name without a reload.
      // The name itself is re-read server-side; this only triggers that.
      await update();
      toast.success('Name updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });
}

export function useUpdateNotificationPreferences() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (mutedTypes: NotificationType[]) =>
      accountApi.updateNotificationPreferences({ mutedTypes }),
    // Optimistic because a switch that visibly lags a round trip reads as
    // broken. The whole array is replaced, so a rollback is a straight restore.
    onMutate: async (mutedTypes) => {
      await qc.cancelQueries({ queryKey: queryKeys.account });
      const previous = qc.getQueryData<AccountProfile>(queryKeys.account);

      if (previous) {
        qc.setQueryData<AccountProfile>(queryKeys.account, {
          ...previous,
          mutedNotificationTypes: mutedTypes,
        });
      }

      return { previous };
    },
    onError: (err: Error, _mutedTypes, context) => {
      if (context?.previous) {
        qc.setQueryData(queryKeys.account, context.previous);
      }
      toast.error(err.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.account }),
  });
}

export function useDeleteAccount() {
  return useMutation({
    mutationFn: (confirmation: DeleteAccountRequest) => accountApi.remove(confirmation),
    onSuccess: () => signOut({ callbackUrl: '/' }),
    // Deliberately no onError toast: the delete modal renders the failure
    // inline, next to the field that caused it.
  });
}
```

- [ ] **Step 7: Verify types and lint**

Run: `cd /home/elx3020/collboard && npm run check-types && npm run lint`
Expected: both PASS with no warnings.

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/api.ts apps/web/lib/hooks/use-queries.ts apps/web/tests/unit/account-api.test.ts
git commit -m "feat: add account api client and query hooks"
```

---

### Task 7: Settings shell, icons, and the profile tab

**Files:**
- Create: `apps/web/components/icons/monitor-icon.tsx`, `settings-icon.tsx`, `log-out-icon.tsx`
- Modify: `apps/web/components/icons/index.ts`
- Create: `apps/web/app/settings/layout.tsx`, `app/settings/page.tsx`, `app/settings/profile/page.tsx`
- Create: `apps/web/components/settings/profile-form.tsx`
- Test: `apps/web/tests/components/profile-form.test.tsx`

**Interfaces:**
- Consumes: `useAccount`, `useUpdateAccountName` from Task 6; `MAX_NAME_LENGTH` from Task 2.
- Produces: `MonitorIcon`, `SettingsIcon`, `LogOutIcon` from `@/components/icons`; the `/settings/*` route shell; `<ProfileForm />`.

- [ ] **Step 1: Write the failing component test**

Create `apps/web/tests/components/profile-form.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { AccountProfile } from '@/lib/types';

const mutate = vi.fn();

let account: AccountProfile | undefined;

vi.mock('@/lib/hooks/use-queries', () => ({
    useAccount: () => ({ data: account, isLoading: false }),
    useUpdateAccountName: () => ({ mutate, isPending: false }),
}));

const profile: AccountProfile = {
    id: 'user-1',
    name: 'Ada',
    email: 'ada@example.com',
    image: null,
    hasPassword: true,
    mutedNotificationTypes: [],
    ownedBoardsWithMembers: 0,
};

beforeEach(() => {
    vi.clearAllMocks();
    account = { ...profile };
});

describe('ProfileForm', () => {
    it('seeds the input from the loaded account', async () => {
        const { ProfileForm } = await import('@/components/settings/profile-form');
        render(<ProfileForm />);

        expect(screen.getByLabelText(/display name/i)).toHaveValue('Ada');
    });

    it('shows the email as read-only text, not an editable field', async () => {
        const { ProfileForm } = await import('@/components/settings/profile-form');
        render(<ProfileForm />);

        expect(screen.getByText('ada@example.com')).toBeTruthy();
        expect(screen.queryByLabelText(/^email$/i)).toBeNull();
    });

    it('submits the trimmed name', async () => {
        const { ProfileForm } = await import('@/components/settings/profile-form');
        render(<ProfileForm />);

        fireEvent.change(screen.getByLabelText(/display name/i), {
            target: { value: '  Ada Lovelace  ' },
        });
        fireEvent.click(screen.getByRole('button', { name: /save/i }));

        expect(mutate).toHaveBeenCalledWith('Ada Lovelace');
    });

    it('does not submit an empty name', async () => {
        const { ProfileForm } = await import('@/components/settings/profile-form');
        render(<ProfileForm />);

        fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: '   ' } });
        fireEvent.click(screen.getByRole('button', { name: /save/i }));

        expect(mutate).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && npx vitest run tests/components/profile-form.test.tsx`
Expected: FAIL — cannot resolve `@/components/settings/profile-form`.

- [ ] **Step 3: Add the three icons**

Create `apps/web/components/icons/monitor-icon.tsx`:

```tsx
import { StrokeIcon, type IconProps } from './icon';

export function MonitorIcon(props: IconProps) {
    return (
        <StrokeIcon {...props}>
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
        </StrokeIcon>
    );
}
```

Create `apps/web/components/icons/settings-icon.tsx`:

```tsx
import { StrokeIcon, type IconProps } from './icon';

export function SettingsIcon(props: IconProps) {
    return (
        <StrokeIcon {...props}>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </StrokeIcon>
    );
}
```

Create `apps/web/components/icons/log-out-icon.tsx`:

```tsx
import { StrokeIcon, type IconProps } from './icon';

export function LogOutIcon(props: IconProps) {
    return (
        <StrokeIcon {...props}>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="m16 17 5-5-5-5" />
            <path d="M21 12H9" />
        </StrokeIcon>
    );
}
```

Add to `apps/web/components/icons/index.ts`, keeping the alphabetical ordering:

```ts
export { LogOutIcon } from './log-out-icon';
export { MonitorIcon } from './monitor-icon';
export { SettingsIcon } from './settings-icon';
```

- [ ] **Step 4: Build the settings shell**

Create `apps/web/app/settings/layout.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { Navbar } from '@/components/navbar';

const TABS = [
    { href: '/settings/profile', label: 'Profile' },
    { href: '/settings/notifications', label: 'Notifications' },
    { href: '/settings/appearance', label: 'Appearance' },
    { href: '/settings/account', label: 'Account' },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    return (
        <div className="min-h-screen bg-[var(--background)]">
            <Navbar />

            <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
                <h1 className="text-2xl font-semibold text-[var(--foreground)]">Settings</h1>

                <nav
                    aria-label="Settings sections"
                    className="mt-6 flex gap-1 overflow-x-auto border-b border-[var(--border)]"
                >
                    {TABS.map((tab) => {
                        const active = pathname === tab.href;
                        return (
                            <Link
                                key={tab.href}
                                href={tab.href}
                                aria-current={active ? 'page' : undefined}
                                className={clsx(
                                    'whitespace-nowrap border-b-2 px-4 py-2 text-sm transition-colors',
                                    active
                                        ? 'border-[var(--accent)] font-medium text-[var(--foreground)]'
                                        : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                                )}
                            >
                                {tab.label}
                            </Link>
                        );
                    })}
                </nav>

                <div className="py-6">{children}</div>
            </div>
        </div>
    );
}
```

Create `apps/web/app/settings/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

/** /settings has no content of its own — the profile tab is the landing tab. */
export default function SettingsPage() {
    redirect('/settings/profile');
}
```

- [ ] **Step 5: Build the profile form and its page**

Create `apps/web/components/settings/profile-form.tsx`:

```tsx
'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useAccount, useUpdateAccountName } from '@/lib/hooks/use-queries';
import { MAX_NAME_LENGTH } from '@/lib/account/validate-name';
import { Avatar, Spinner } from '@/components/ui-shared';

const inputClass =
    'mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]';

export function ProfileForm() {
    const { data: account, isLoading } = useAccount();
    const updateName = useUpdateAccountName();
    const [name, setName] = useState('');

    // Seed once the account arrives. Keyed on the loaded name so a refetch
    // after a successful save does not fight the user's in-flight typing.
    useEffect(() => {
        if (account) setName(account.name ?? '');
    }, [account?.name]); // eslint-disable-line react-hooks/exhaustive-deps

    if (isLoading || !account) return <Spinner />;

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;
        updateName.mutate(trimmed);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex items-center gap-3">
                <Avatar src={account.image} name={account.name || account.email} size="lg" />
                <p className="text-sm text-[var(--muted-foreground)]">
                    Your picture comes from the account you signed in with.
                </p>
            </div>

            <div>
                <label
                    htmlFor="display-name"
                    className="block text-sm font-medium text-[var(--foreground)]"
                >
                    Display name
                </label>
                <input
                    id="display-name"
                    type="text"
                    value={name}
                    maxLength={MAX_NAME_LENGTH}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClass}
                />
                <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    This is the name teammates see. Existing notifications keep the name you
                    had when they were sent.
                </p>
            </div>

            <div>
                <span className="block text-sm font-medium text-[var(--foreground)]">Email</span>
                <p className="mt-1 text-sm text-[var(--muted-foreground)]">{account.email}</p>
            </div>

            <button
                type="submit"
                disabled={updateName.isPending || !name.trim()}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-foreground)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
                {updateName.isPending ? 'Saving...' : 'Save'}
            </button>
        </form>
    );
}
```

Create `apps/web/app/settings/profile/page.tsx`:

```tsx
'use client';

import { ProfileForm } from '@/components/settings/profile-form';

export default function ProfileSettingsPage() {
    return <ProfileForm />;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run tests/components/profile-form.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/icons apps/web/app/settings apps/web/components/settings apps/web/tests/components/profile-form.test.tsx
git commit -m "feat: add settings shell and profile tab"
```

---

### Task 8: Notifications tab

**Files:**
- Create: `apps/web/components/settings/notification-toggles.tsx`
- Create: `apps/web/app/settings/notifications/page.tsx`
- Test: `apps/web/tests/components/notification-toggles.test.tsx`

**Interfaces:**
- Consumes: `useAccount`, `useUpdateNotificationPreferences` from Task 6.
- Produces: `<NotificationToggles />`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/components/notification-toggles.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { AccountProfile } from '@/lib/types';

const mutate = vi.fn();

let account: AccountProfile | undefined;

vi.mock('@/lib/hooks/use-queries', () => ({
    useAccount: () => ({ data: account, isLoading: false }),
    useUpdateNotificationPreferences: () => ({ mutate, isPending: false }),
}));

const profile: AccountProfile = {
    id: 'user-1',
    name: 'Ada',
    email: 'ada@example.com',
    image: null,
    hasPassword: true,
    mutedNotificationTypes: ['BOARD_TASK_ADDED'],
    ownedBoardsWithMembers: 0,
};

beforeEach(() => {
    vi.clearAllMocks();
    account = { ...profile, mutedNotificationTypes: ['BOARD_TASK_ADDED'] };
});

describe('NotificationToggles', () => {
    it('renders one switch per notification type', async () => {
        const { NotificationToggles } = await import('@/components/settings/notification-toggles');
        render(<NotificationToggles />);

        expect(screen.getAllByRole('switch')).toHaveLength(6);
    });

    it('shows a muted type as off and an unmuted type as on', async () => {
        const { NotificationToggles } = await import('@/components/settings/notification-toggles');
        render(<NotificationToggles />);

        expect(screen.getByRole('switch', { name: /new tasks on your boards/i })).toHaveAttribute(
            'aria-checked',
            'false',
        );
        expect(screen.getByRole('switch', { name: /assigned to you/i })).toHaveAttribute(
            'aria-checked',
            'true',
        );
    });

    it('muting a type sends the whole array with that type added', async () => {
        const { NotificationToggles } = await import('@/components/settings/notification-toggles');
        render(<NotificationToggles />);

        fireEvent.click(screen.getByRole('switch', { name: /assigned to you/i }));

        expect(mutate).toHaveBeenCalledWith(['BOARD_TASK_ADDED', 'TASK_ASSIGNED']);
    });

    it('unmuting a type sends the array with that type removed', async () => {
        const { NotificationToggles } = await import('@/components/settings/notification-toggles');
        render(<NotificationToggles />);

        fireEvent.click(screen.getByRole('switch', { name: /new tasks on your boards/i }));

        expect(mutate).toHaveBeenCalledWith([]);
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && npx vitest run tests/components/notification-toggles.test.tsx`
Expected: FAIL — cannot resolve `@/components/settings/notification-toggles`.

- [ ] **Step 3: Implement the component**

Create `apps/web/components/settings/notification-toggles.tsx`:

```tsx
'use client';

import { clsx } from 'clsx';
import { useAccount, useUpdateNotificationPreferences } from '@/lib/hooks/use-queries';
import { Spinner } from '@/components/ui-shared';
import type { NotificationType } from '@/lib/types';

/**
 * Setting copy, in the order the switches appear. Deliberately separate from
 * `formatNotification` in lib/notifications/format.ts: that writes the text of
 * a single notice, this names a category the user is choosing to receive.
 */
const SETTINGS: { type: NotificationType; label: string; hint: string }[] = [
    {
        type: 'TASK_ASSIGNED',
        label: 'Tasks assigned to you',
        hint: 'When someone puts your name on a task.',
    },
    {
        type: 'TASK_COMMENTED',
        label: 'Comments on your tasks',
        hint: 'Tasks you are assigned to or have commented on.',
    },
    {
        type: 'BOARD_INVITED',
        label: 'Board invitations',
        hint: 'When someone adds you to a board.',
    },
    {
        type: 'BOARD_ROLE_CHANGED',
        label: 'Role changes',
        hint: 'When your role on a board changes.',
    },
    {
        type: 'BOARD_TASK_ADDED',
        label: 'New tasks on your boards',
        hint: 'Every task created on a board you belong to.',
    },
    {
        type: 'BOARD_TASK_REMOVED',
        label: 'Deleted tasks on your boards',
        hint: 'Every task deleted from a board you belong to.',
    },
];

export function NotificationToggles() {
    const { data: account, isLoading } = useAccount();
    const updatePreferences = useUpdateNotificationPreferences();

    if (isLoading || !account) return <Spinner />;

    const muted = account.mutedNotificationTypes;

    const toggle = (type: NotificationType) => {
        // Send the whole array, not a delta: PUT replaces it, so two quick
        // flips cannot interleave into a half-written state.
        const next = muted.includes(type)
            ? muted.filter((t) => t !== type)
            : [...muted, type];

        updatePreferences.mutate(next);
    };

    return (
        <ul className="divide-y divide-[var(--border)]">
            {SETTINGS.map(({ type, label, hint }) => {
                const enabled = !muted.includes(type);

                return (
                    <li key={type} className="flex items-center justify-between gap-4 py-4">
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-[var(--foreground)]">{label}</p>
                            <p className="text-xs text-[var(--muted-foreground)]">{hint}</p>
                        </div>

                        <button
                            type="button"
                            role="switch"
                            aria-checked={enabled}
                            aria-label={label}
                            onClick={() => toggle(type)}
                            className={clsx(
                                'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                                enabled ? 'bg-[var(--accent)]' : 'bg-[var(--muted)]'
                            )}
                        >
                            <span
                                className={clsx(
                                    'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                                    enabled ? 'translate-x-5' : 'translate-x-0.5'
                                )}
                            />
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}
```

Create `apps/web/app/settings/notifications/page.tsx`:

```tsx
'use client';

import { NotificationToggles } from '@/components/settings/notification-toggles';

export default function NotificationSettingsPage() {
    return (
        <div className="space-y-4">
            <p className="text-sm text-[var(--muted-foreground)]">
                Turning one off stops the notification being created at all — it will not
                appear in your bell.
            </p>
            <NotificationToggles />
        </div>
    );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/web && npx vitest run tests/components/notification-toggles.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/settings/notification-toggles.tsx apps/web/app/settings/notifications apps/web/tests/components/notification-toggles.test.tsx
git commit -m "feat: add notification settings tab"
```

---

### Task 9: Appearance tab

**Files:**
- Create: `apps/web/components/settings/theme-selector.tsx`
- Create: `apps/web/app/settings/appearance/page.tsx`
- Test: `apps/web/tests/components/theme-selector.test.tsx`

**Interfaces:**
- Consumes: `useTheme` from `next-themes`; `SunIcon`, `MoonIcon`, `MonitorIcon` from `@/components/icons` (Task 7).
- Produces: `<ThemeSelector />`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/components/theme-selector.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

const setTheme = vi.fn();
let theme = 'system';

vi.mock('next-themes', () => ({
    useTheme: () => ({ theme, setTheme }),
}));

beforeEach(() => {
    vi.clearAllMocks();
    theme = 'system';
});

describe('ThemeSelector', () => {
    it('offers System, Light and Dark', async () => {
        const { ThemeSelector } = await import('@/components/settings/theme-selector');
        render(<ThemeSelector />);

        expect(screen.getByRole('radio', { name: /system/i })).toBeTruthy();
        expect(screen.getByRole('radio', { name: /light/i })).toBeTruthy();
        expect(screen.getByRole('radio', { name: /dark/i })).toBeTruthy();
    });

    it('marks the active theme as checked', async () => {
        theme = 'dark';
        const { ThemeSelector } = await import('@/components/settings/theme-selector');
        render(<ThemeSelector />);

        expect(screen.getByRole('radio', { name: /dark/i })).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByRole('radio', { name: /light/i })).toHaveAttribute('aria-checked', 'false');
    });

    it('sets the theme on click', async () => {
        const { ThemeSelector } = await import('@/components/settings/theme-selector');
        render(<ThemeSelector />);

        fireEvent.click(screen.getByRole('radio', { name: /light/i }));

        expect(setTheme).toHaveBeenCalledWith('light');
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && npx vitest run tests/components/theme-selector.test.tsx`
Expected: FAIL — cannot resolve `@/components/settings/theme-selector`.

- [ ] **Step 3: Implement the component**

Create `apps/web/components/settings/theme-selector.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { clsx } from 'clsx';
import { MonitorIcon, MoonIcon, SunIcon } from '@/components/icons';

const OPTIONS = [
    { value: 'system', label: 'System', Icon: MonitorIcon },
    { value: 'light', label: 'Light', Icon: SunIcon },
    { value: 'dark', label: 'Dark', Icon: MoonIcon },
] as const;

/**
 * Three-way theme control.
 *
 * The choice stays in localStorage via next-themes — it is per-browser and
 * never reaches the server, so there is no API call here.
 */
export function ThemeSelector() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    // Before hydration the resolved theme is unknown, and rendering a selection
    // anyway marks the wrong option as active.
    useEffect(() => setMounted(true), []);

    return (
        <div role="radiogroup" aria-label="Theme" className="grid max-w-md grid-cols-3 gap-2">
            {OPTIONS.map(({ value, label, Icon }) => {
                const active = mounted && theme === value;

                return (
                    <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        aria-label={label}
                        onClick={() => setTheme(value)}
                        className={clsx(
                            'flex flex-col items-center gap-2 rounded-lg border px-4 py-4 text-sm transition-colors',
                            active
                                ? 'border-[var(--accent)] bg-[var(--muted)] font-medium text-[var(--foreground)]'
                                : 'border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--muted)]'
                        )}
                    >
                        <Icon className="h-5 w-5" />
                        {label}
                    </button>
                );
            })}
        </div>
    );
}
```

Create `apps/web/app/settings/appearance/page.tsx`:

```tsx
'use client';

import { ThemeSelector } from '@/components/settings/theme-selector';

export default function AppearanceSettingsPage() {
    return (
        <div className="space-y-4">
            <p className="text-sm text-[var(--muted-foreground)]">
                System follows your device setting. This choice is saved in this browser
                only.
            </p>
            <ThemeSelector />
        </div>
    );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/web && npx vitest run tests/components/theme-selector.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/settings/theme-selector.tsx apps/web/app/settings/appearance apps/web/tests/components/theme-selector.test.tsx
git commit -m "feat: add appearance settings tab"
```

---

### Task 10: Account tab — log out and delete

**Files:**
- Create: `apps/web/components/settings/delete-account-modal.tsx`
- Create: `apps/web/app/settings/account/page.tsx`
- Test: `apps/web/tests/components/delete-account-modal.test.tsx`

**Interfaces:**
- Consumes: `useAccount`, `useDeleteAccount` from Task 6; `Modal` from `@/components/modal`; `LogOutIcon`, `AlertTriangleIcon` from `@/components/icons`.
- Produces: `<DeleteAccountModal open onClose />`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/components/delete-account-modal.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import type { AccountProfile } from '@/lib/types';

const mutate = vi.fn();
let account: AccountProfile | undefined;
let mutationError: Error | null = null;

vi.mock('@/lib/hooks/use-queries', () => ({
    useAccount: () => ({ data: account, isLoading: false }),
    useDeleteAccount: () => ({ mutate, isPending: false, error: mutationError }),
}));

const profile: AccountProfile = {
    id: 'user-1',
    name: 'Ada',
    email: 'ada@example.com',
    image: null,
    hasPassword: true,
    mutedNotificationTypes: [],
    ownedBoardsWithMembers: 2,
};

beforeEach(() => {
    vi.clearAllMocks();
    account = { ...profile };
    mutationError = null;
});

describe('DeleteAccountModal', () => {
    it('asks for a password when the account has one', async () => {
        const { DeleteAccountModal } = await import('@/components/settings/delete-account-modal');
        render(<DeleteAccountModal open onClose={() => {}} />);

        expect(screen.getByLabelText(/password/i)).toBeTruthy();
        expect(screen.queryByLabelText(/email address/i)).toBeNull();
    });

    it('asks for the email address when the account has no password', async () => {
        account = { ...profile, hasPassword: false };
        const { DeleteAccountModal } = await import('@/components/settings/delete-account-modal');
        render(<DeleteAccountModal open onClose={() => {}} />);

        expect(screen.getByLabelText(/email address/i)).toBeTruthy();
        expect(screen.queryByLabelText(/password/i)).toBeNull();
    });

    it('names how many shared boards will be destroyed', async () => {
        const { DeleteAccountModal } = await import('@/components/settings/delete-account-modal');
        render(<DeleteAccountModal open onClose={() => {}} />);

        expect(screen.getByText(/2 boards/i)).toBeTruthy();
    });

    it('keeps the confirm button disabled until the field is filled', async () => {
        const { DeleteAccountModal } = await import('@/components/settings/delete-account-modal');
        render(<DeleteAccountModal open onClose={() => {}} />);

        const confirm = screen.getByRole('button', { name: /delete my account/i });
        expect(confirm).toBeDisabled();

        fireEvent.change(screen.getByLabelText(/password/i), {
            target: { value: 'CorrectHorse1!' },
        });
        expect(confirm).not.toBeDisabled();
    });

    it('submits the password as the confirmation', async () => {
        const { DeleteAccountModal } = await import('@/components/settings/delete-account-modal');
        render(<DeleteAccountModal open onClose={() => {}} />);

        fireEvent.change(screen.getByLabelText(/password/i), {
            target: { value: 'CorrectHorse1!' },
        });
        fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));

        expect(mutate).toHaveBeenCalledWith({ password: 'CorrectHorse1!' });
    });

    it('submits the email as the confirmation for an OAuth-only account', async () => {
        account = { ...profile, hasPassword: false };
        const { DeleteAccountModal } = await import('@/components/settings/delete-account-modal');
        render(<DeleteAccountModal open onClose={() => {}} />);

        fireEvent.change(screen.getByLabelText(/email address/i), {
            target: { value: 'ada@example.com' },
        });
        fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));

        expect(mutate).toHaveBeenCalledWith({ confirmEmail: 'ada@example.com' });
    });

    it('shows a failure inline rather than closing', async () => {
        mutationError = new Error('Confirmation failed');
        const { DeleteAccountModal } = await import('@/components/settings/delete-account-modal');
        render(<DeleteAccountModal open onClose={() => {}} />);

        expect(screen.getByText('Confirmation failed')).toBeTruthy();
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && npx vitest run tests/components/delete-account-modal.test.tsx`
Expected: FAIL — cannot resolve `@/components/settings/delete-account-modal`.

- [ ] **Step 3: Implement the modal**

Create `apps/web/components/settings/delete-account-modal.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { Modal } from '@/components/modal';
import { AlertTriangleIcon } from '@/components/icons';
import { useAccount, useDeleteAccount } from '@/lib/hooks/use-queries';

const inputClass =
    'mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]';

export function DeleteAccountModal({
    open,
    onClose,
}: {
    open: boolean;
    onClose: () => void;
}) {
    const { data: account } = useAccount();
    const deleteAccount = useDeleteAccount();
    const [confirmation, setConfirmation] = useState('');

    if (!account) return null;

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        if (!confirmation.trim()) return;

        // Which proof the server demands depends on the account, so the form
        // sends whichever one it collected.
        deleteAccount.mutate(
            account.hasPassword
                ? { password: confirmation }
                : { confirmEmail: confirmation }
        );
    };

    return (
        <Modal open={open} onClose={onClose} title="Delete account" size="md">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex gap-3 rounded-lg border border-[var(--destructive)] p-3">
                    <AlertTriangleIcon className="h-5 w-5 shrink-0 text-[var(--destructive)]" />
                    <div className="space-y-2 text-sm text-[var(--foreground)]">
                        <p>This permanently deletes your account. It cannot be undone.</p>
                        {account.ownedBoardsWithMembers > 0 && (
                            <p>
                                <strong>
                                    {account.ownedBoardsWithMembers} boards
                                </strong>{' '}
                                you own are shared with other people. Deleting your account
                                deletes those boards for everyone on them, along with all their
                                columns, tasks and comments.
                            </p>
                        )}
                    </div>
                </div>

                <div>
                    <label
                        htmlFor="delete-confirmation"
                        className="block text-sm font-medium text-[var(--foreground)]"
                    >
                        {account.hasPassword
                            ? 'Confirm your password'
                            : 'Type your email address to confirm'}
                    </label>
                    <input
                        id="delete-confirmation"
                        type={account.hasPassword ? 'password' : 'email'}
                        autoComplete={account.hasPassword ? 'current-password' : 'off'}
                        value={confirmation}
                        onChange={(e) => setConfirmation(e.target.value)}
                        className={inputClass}
                    />
                    {deleteAccount.error && (
                        <p className="mt-1 text-sm text-[var(--destructive)]">
                            {deleteAccount.error.message}
                        </p>
                    )}
                </div>

                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={deleteAccount.isPending || !confirmation.trim()}
                        className="rounded-lg bg-[var(--destructive)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                        {deleteAccount.isPending ? 'Deleting...' : 'Delete my account'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}
```

The label text is the accessible name for both fields, so the tests find the password field by `/password/i` and the email field by `/email address/i`.

- [ ] **Step 4: Build the account page**

Create `apps/web/app/settings/account/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { LogOutIcon } from '@/components/icons';
import { DeleteAccountModal } from '@/components/settings/delete-account-modal';

export default function AccountSettingsPage() {
    const [deleteOpen, setDeleteOpen] = useState(false);

    return (
        <div className="space-y-8">
            <section className="space-y-2">
                <h2 className="text-sm font-medium text-[var(--foreground)]">Session</h2>
                <p className="text-sm text-[var(--muted-foreground)]">
                    Sign out of Collboard on this device.
                </p>
                <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: '/' })}
                    className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
                >
                    <LogOutIcon className="h-4 w-4" />
                    Log out
                </button>
            </section>

            <section className="space-y-2 rounded-lg border border-[var(--destructive)] p-4">
                <h2 className="text-sm font-medium text-[var(--destructive)]">Danger zone</h2>
                <p className="text-sm text-[var(--muted-foreground)]">
                    Deleting your account removes it permanently, along with every board you
                    own — including boards you share with other people. There is no way to
                    recover them.
                </p>
                <button
                    type="button"
                    onClick={() => setDeleteOpen(true)}
                    className="rounded-lg bg-[var(--destructive)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                >
                    Delete account
                </button>
            </section>

            <DeleteAccountModal open={deleteOpen} onClose={() => setDeleteOpen(false)} />
        </div>
    );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd apps/web && npx vitest run tests/components/delete-account-modal.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/settings/delete-account-modal.tsx apps/web/app/settings/account apps/web/tests/components/delete-account-modal.test.tsx
git commit -m "feat: add account tab with log out and delete"
```

---

### Task 11: Navbar avatar menu

**Files:**
- Create: `apps/web/components/user-menu.tsx`
- Modify: `apps/web/components/navbar.tsx:36-64`
- Test: `apps/web/tests/components/user-menu.test.tsx`

**Interfaces:**
- Consumes: `SettingsIcon`, `LogOutIcon` from Task 7; `Avatar` from `@/components/ui-shared`.
- Produces: `<UserMenu />`, replacing the inline avatar and Sign out button in the navbar.

- [ ] **Step 1: Write the failing test**

Create `apps/web/tests/components/user-menu.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

const signOutMock = vi.fn();

vi.mock('next-auth/react', () => ({
    signOut: (...args: unknown[]) => signOutMock(...args),
    useSession: () => ({
        data: { user: { id: 'user-1', email: 'ada@example.com', name: 'Ada', image: null } },
    }),
}));

vi.mock('next/link', () => ({
    default: ({ href, children }: { href: string; children: React.ReactNode }) => (
        <a href={href}>{children}</a>
    ),
}));

beforeEach(() => {
    vi.clearAllMocks();
});

describe('UserMenu', () => {
    it('keeps the menu closed until the avatar is clicked', async () => {
        const { UserMenu } = await import('@/components/user-menu');
        render(<UserMenu />);

        expect(screen.queryByRole('menuitem', { name: /settings/i })).toBeNull();
    });

    it('opens a menu with Settings and Log out', async () => {
        const { UserMenu } = await import('@/components/user-menu');
        render(<UserMenu />);

        fireEvent.click(screen.getByRole('button', { name: /account menu/i }));

        expect(screen.getByRole('menuitem', { name: /settings/i })).toHaveAttribute(
            'href',
            '/settings/profile',
        );
        expect(screen.getByRole('menuitem', { name: /log out/i })).toBeTruthy();
    });

    it('signs out and returns to the landing page', async () => {
        const { UserMenu } = await import('@/components/user-menu');
        render(<UserMenu />);

        fireEvent.click(screen.getByRole('button', { name: /account menu/i }));
        fireEvent.click(screen.getByRole('menuitem', { name: /log out/i }));

        expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: '/' });
    });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && npx vitest run tests/components/user-menu.test.tsx`
Expected: FAIL — cannot resolve `@/components/user-menu`.

- [ ] **Step 3: Implement the menu**

Create `apps/web/components/user-menu.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import { Avatar } from '@/components/ui-shared';
import { LogOutIcon, SettingsIcon } from '@/components/icons';

const itemClass =
    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]';

export function UserMenu() {
    const { data: session } = useSession();
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Close on an outside click or Escape — the menu is not a modal, so it must
    // not trap focus or block the page behind it.
    useEffect(() => {
        if (!open) return;

        const handlePointerDown = (e: MouseEvent) => {
            if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const handleKeyDown = (e: globalThis.KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open]);

    if (!session?.user) return null;

    const label = session.user.name || session.user.email;

    return (
        <div ref={containerRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={open}
                className="flex items-center gap-2 rounded-full p-0.5 transition-colors hover:bg-[var(--muted)]"
            >
                <span className="hidden text-sm text-[var(--muted-foreground)] sm:inline">
                    {label}
                </span>
                <Avatar src={session.user.image} name={label} size="sm" />
            </button>

            {open && (
                <div
                    role="menu"
                    className="absolute right-0 z-50 mt-2 w-48 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg"
                >
                    <Link
                        role="menuitem"
                        href="/settings/profile"
                        onClick={() => setOpen(false)}
                        className={itemClass}
                    >
                        <SettingsIcon className="h-4 w-4" />
                        Settings
                    </Link>
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => signOut({ callbackUrl: '/' })}
                        className={itemClass}
                    >
                        <LogOutIcon className="h-4 w-4" />
                        Log out
                    </button>
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 4: Wire it into the navbar**

In `apps/web/components/navbar.tsx`, replace the whole `{session?.user && ( ... )}` block — the name span, the `Image`/initial avatar, and the Sign out button — with:

```tsx
                    <UserMenu />
```

Add the import `import { UserMenu } from '@/components/user-menu';` and remove the now-unused `signOut`, `useSession`, and `Image` imports **only if nothing else in the file uses them** — the logo still uses `Image`, so keep that one. Lint will fail on any import left unused.

- [ ] **Step 5: Update the existing Navbar tests**

`apps/web/tests/components/components.test.tsx:58-77` asserts the old button by its text and will fail. Replace the whole `describe('Navbar', ...)` block with:

```tsx
describe('Navbar', () => {
    it('renders the logo and the account menu', async () => {
        const { Navbar } = await import('@/components/navbar');

        render(<Navbar />);

        expect(screen.getByText('Collboard')).toBeInTheDocument();
        expect(screen.getByText('Test User')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /account menu/i })).toBeInTheDocument();
    });

    it('calls signOut from the account menu', async () => {
        const { signOut } = await import('next-auth/react');
        const { Navbar } = await import('@/components/navbar');

        render(<Navbar />);
        fireEvent.click(screen.getByRole('button', { name: /account menu/i }));
        fireEvent.click(screen.getByRole('menuitem', { name: /log out/i }));

        expect(signOut).toHaveBeenCalledWith({ callbackUrl: '/' });
    });
});
```

That file's existing mocks for `next-auth/react`, `next/image` and `next/link` already cover everything `UserMenu` needs.

- [ ] **Step 6: Run the component tests to verify they pass**

Run: `cd apps/web && npx vitest run tests/components/user-menu.test.tsx tests/components/components.test.tsx`
Expected: PASS.

- [ ] **Step 7: Run the whole suite and the linters**

Run: `npm run lint && npm run check-types && npm run test`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/user-menu.tsx apps/web/components/navbar.tsx apps/web/tests/components/user-menu.test.tsx apps/web/tests/components/components.test.tsx
git commit -m "feat: replace the navbar sign-out button with an account menu"
```

---

### Task 12: End-to-end account lifecycle

**Files:**
- Create: `apps/web/tests/e2e/account-settings.spec.ts`

**Interfaces:**
- Consumes: everything above, through the running app.
- Produces: nothing other code depends on.

- [ ] **Step 1: Install the browser if it is not present**

Browsers are not downloaded on install (`.npmrc` sets `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`).

```bash
cd /home/elx3020/collboard && npx playwright install --with-deps chromium
```

- [ ] **Step 2: Write the spec**

Create `apps/web/tests/e2e/account-settings.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

/**
 * E2E: the account lifecycle — register, rename, delete.
 *
 * Runs against a disposable account created inside the test, so exercising the
 * destructive path costs nothing. Serial because every step depends on the
 * account created in the first one.
 */
test.describe.configure({ mode: 'serial' });

test.describe('Account settings', () => {
  const email = `settings-${Date.now()}@example.com`;
  const password = 'CorrectHorse1!';

  test('registers, renames, and deletes the account', async ({ page }) => {
    // ── Register ──
    await page.goto('/auth/signup');
    await page.getByLabel(/name/i).fill('Ada');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel(/confirm password/i).fill(password);
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page).toHaveURL(/\/dashboard|\/auth\/signin/, { timeout: 15_000 });

    // A fresh registration may drop the user at sign-in rather than straight
    // into the dashboard, depending on the auto-sign-in path.
    if (page.url().includes('/auth/signin')) {
      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/password/i).fill(password);
      await page.getByRole('button', { name: /sign in/i }).click();
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    }

    // ── Rename ──
    await page.goto('/settings/profile');
    const nameInput = page.getByLabel(/display name/i);
    await expect(nameInput).toHaveValue('Ada');
    await nameInput.fill('Ada Lovelace');
    await page.getByRole('button', { name: /^save$/i }).click();

    // The navbar reads the session, so this only passes if the JWT update
    // trigger refreshed the name.
    await expect(page.getByRole('button', { name: /account menu/i })).toContainText(
      'Ada Lovelace',
      { timeout: 15_000 },
    );

    // ── Delete ──
    await page.goto('/settings/account');
    await page.getByRole('button', { name: /^delete account$/i }).click();
    await page.getByLabel(/confirm your password/i).fill(password);
    await page.getByRole('button', { name: /delete my account/i }).click();

    await expect(page).toHaveURL('/', { timeout: 15_000 });

    // ── The credentials no longer work ──
    await page.goto('/auth/signin');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /sign in/i }).click();

    await expect(page.getByText(/invalid|error|failed/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('the notification toggles persist across a reload', async ({ page }) => {
    const toggleEmail = `toggles-${Date.now()}@example.com`;

    await page.goto('/auth/signup');
    await page.getByLabel(/name/i).fill('Grace');
    await page.getByLabel(/email/i).fill(toggleEmail);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel(/confirm password/i).fill(password);
    await page.getByRole('button', { name: /create account/i }).click();

    if (page.url().includes('/auth/signin')) {
      await page.getByLabel(/email/i).fill(toggleEmail);
      await page.getByLabel(/password/i).fill(password);
      await page.getByRole('button', { name: /sign in/i }).click();
    }
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto('/settings/notifications');
    const toggle = page.getByRole('switch', { name: /new tasks on your boards/i });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    await page.reload();
    await expect(
      page.getByRole('switch', { name: /new tasks on your boards/i }),
    ).toHaveAttribute('aria-checked', 'false', { timeout: 15_000 });
  });
});
```

- [ ] **Step 3: Run the spec**

From the repo root, so the config that boots its own dev server is used:

```bash
cd /home/elx3020/collboard && npx playwright test apps/web/tests/e2e/account-settings.spec.ts
```

Expected: PASS (2 tests). The selectors match `app/auth/signup/page.tsx` as it stands: the submit button reads "Create Account", and the fields are labelled "Name (optional)", "Email", "Password" and "Confirm Password".

- [ ] **Step 4: Run the full pipeline**

```bash
cd /home/elx3020/collboard && ./scripts/test-ci-local.sh quality test e2e build
```

Expected: every stage passes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/tests/e2e/account-settings.spec.ts
git commit -m "test: add end-to-end account settings spec"
```

---

## Notes for the implementer

- **The migration must run before anything type-checks.** Task 1 Step 5 is not optional scaffolding; `mutedNotificationTypes` does not exist on the Prisma types until `prisma generate` has run.
- **The rate limiter is process-global and unreset between tests in a file.** That is why the delete tests each use a distinct `session.user.id`. If you add more delete tests, keep giving them fresh ids.
- **`resolveRecipients` order matters to existing tests.** Filter the candidate array against a `Set` of allowed ids; do not map the database rows directly.
- **Do not add an email-change or password-change form.** Both are explicitly out of scope in the spec and need their own verification and token-revocation design.
