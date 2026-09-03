# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Root scripts: `npm run dev`, `build`, `lint`, `check-types`, `format`, `test`, `test:watch`, `test:coverage`, `test:e2e`, `test:e2e:ui`. `test` fans out through Turbo; the watch/coverage variants delegate straight to the `web` workspace (persistent tasks Turbo shouldn't cache).

Single tests have no root shortcut — go through the workspace:

```bash
cd apps/web
npx vitest run tests/unit/rbac.test.ts           # single file
npx vitest run -t "returns boards the user owns" # single test by name
```

E2E has **two Playwright configs** — pick deliberately:

- `playwright.config.ts` (repo root) — used by the root `npm run test:e2e` and by CI. Has a `webServer` block that boots the `apps/web` dev server itself.
- `apps/web/playwright.config.ts` — used by `cd apps/web && npm run test:e2e`. No `webServer`; expects a server already listening on `PLAYWRIGHT_BASE_URL` (default `http://localhost:3000`).

Browsers are not downloaded on install (`.npmrc` sets `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`) — run `npx playwright install --with-deps chromium` first.

`./scripts/test-ci-local.sh [quality|test|e2e|build ...]` replays the GitHub Actions pipeline locally, including starting/tearing down Postgres and Redis via `docker-compose.yml`.

Local setup: `docker-compose up -d` (Postgres 5432 + Redis 6379), then `cd apps/web && npx prisma migrate dev && npx prisma generate`. **Prisma Client must be generated before lint/type-check/build will pass** — CI does this as its first step in every job.

## Architecture

Turborepo monorepo; `apps/web` is the only substantive app (`apps/docs` is the unmodified Turborepo starter, `packages/ui` holds three demo components). Assume work lands in `apps/web` unless told otherwise.

### Two processes, one container

`apps/web` runs **Next.js (port 3000) and a standalone WebSocket server (port 3002) as separate processes**:

- Dev: `concurrently` runs `next dev` and `tsx watch ws-server.ts`.
- Prod: `apps/web/entrypoint.sh` starts `server.js` (Next standalone) and `ws-server.cjs` (esbuild-bundled from `ws-server.ts`), forwarding SIGTERM to both.
- Caddy routes `/ws*` → 3002 and everything else → 3000, so the browser sees one origin.

Because they are separate processes, **API routes cannot push to sockets directly**. The full real-time path is:

```
API route → Prisma write → publishEvent() → Redis PUBLISH board:<boardId>
          → ws-server psubscribe 'board:*' → broadcast to in-memory room → client
          → client invalidates the React Query key for the board
```

Redis is _only_ a pub/sub bus — nothing is cached or persisted there. Channel helpers and every event payload type live in `apps/web/lib/types.ts` (`EventType`, `CHANNELS`, `WsServerEventMap`); `lib/redis.ts` keeps three separate ioredis connections (client / publisher / subscriber) because a subscribed connection cannot issue other commands.

Clients never get optimistic patches from events — `useBoardRealtime` callbacks invalidate the React Query cache and the board refetches. Adding a new real-time event means touching four places: `EventType` + payload type in `lib/types.ts`, `publishEvent` in the API route, the `on(...)` wiring in `lib/hooks/use-board-realtime.tsx`, and the consumer's callback.

**Presence (`user:joined`/`user:left`) bypasses Redis** and lives in ws-server's in-memory `rooms` map. This is correct only for a single container; see "Known constraints" in DEPLOYMENT.md before adding replicas.

### WebSocket auth

The NextAuth session cookie is httpOnly, so the browser fetches the raw JWT from `GET /api/auth/ws-token` and passes it as a `?token=` query param. `ws-server.ts` verifies it in the HTTP `upgrade` handler _before_ `handleUpgrade`, attaching `{ userId, boardId, alive }` to the socket; an unverified upgrade gets a raw `401` and a destroyed socket.

### API routes

Every route is wrapped in `withAuth` from `lib/auth/api-guard.ts`, which supplies per-IP rate limiting (60/min, in-memory `Map` — not shared across processes), session lookup, `params` promise resolution, and translation of `UnauthorizedError`/`AuthorizationError` into status codes. Handlers receive `(req, { params, userId })` and should throw rather than hand-roll 401/403 responses.

Authorization is permission-based, not role-based at the call site: call `requireBoardPermission(userId, boardId, 'task:move')`. The permission → minimum-role table and the OWNER > EDITOR > VIEWER hierarchy are in `lib/auth/rbac.ts`; board owners are implicitly OWNER without a `BoardMember` row.

Auth uses the NextAuth JWT strategy (required for the credentials provider) with a 15-minute access token and a rotating refresh token. `lib/auth/tokens.ts` implements refresh-token families with **reuse detection** — presenting an already-revoked token revokes the whole family. A `RefreshTokenError` on the session is turned into a redirect by `middleware.ts` and a 401 by `withAuth`.

Ordering of columns and tasks is a dense integer `order` column maintained by hand: moves run inside `prisma.$transaction`, decrementing the gap in the source column and incrementing to make space in the target (see `app/api/boards/[boardId]/tasks/[taskId]/move/route.ts`). Preserve that pattern for any new reordering endpoint.

### Client data layer

React Query owns all server state; `lib/hooks/use-queries.ts` holds the hooks _and_ the `queryKeys` factory — always derive keys from it. `lib/api.ts` is the typed fetch layer. Zustand (`lib/stores/ui-store.ts`) holds only UI state (open modals, search, priority filter). Drag and drop is `@dnd-kit`.

### Prisma

Prisma 7 with the `@prisma/adapter-pg` driver adapter over a `pg` Pool (not the default engine connection). `prisma.config.ts` supplies schema/migration paths and loads `.env` via dotenv. Dev caches the client on `globalThis` to survive HMR.

## Environment

`apps/web/.env` for local dev: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `REDIS_URL`, plus optional GitHub/Google OAuth pairs. Any new env var must also be added to `turbo.json` (`globalEnv` or the relevant task's `env`) or Turbo will warn and caching will be wrong.

`NEXT_PUBLIC_WS_URL` is inlined at **build time**, so it is a Docker build arg, not a runtime variable. It defaults to `/ws` in the production image; leave it unset locally and the client falls back to `ws://<host>:3002`.

## Deployment

Manual "Run workflow" button on the Actions tab (`workflow_dispatch`; build and deploy only run when the selected ref is `main`) → lint/types → tests + e2e → arm64 image to GHCR → SSH deploy to a single Oracle ARM VM running `docker-compose.prod.yml` (web + Postgres + Redis + Caddy). The deploy job scps `docker-compose.prod.yml` and `Caddyfile` to the VM, so edits to those files take effect on the next deploy. Rollback is by `IMAGE_TAG` (code only — migrations are never reverted). Full runbook and accepted trade-offs: `DEPLOYMENT.md`.

## Conventions

- `@/*` maps to `apps/web/*`.
- Husky pre-commit runs `npm run lint`; lint-staged additionally runs `eslint --fix` and Prettier on staged files. Lint is `--max-warnings 0` everywhere, and `eslint-plugin-only-warn` downgrades errors to warnings — so _any_ lint finding fails the build.
- Vitest defaults to the `node` environment; component tests opt in with a `// @vitest-environment happy-dom` comment on line 1. Integration tests mock `@/lib/prisma` and `next-auth/next` rather than hitting a database.
- Icons live in `components/icons/` — one file per glyph, one definition per glyph, re-exported
  from the `@/components/icons` barrel. Never inline an `<svg>` in a feature component; add an
  icon to the library instead. Each icon takes `IconProps` (all `<svg>` props) and spreads them
  last over the `StrokeIcon`/`FillIcon` base, so size, colour and stroke width stay with the call
  site. Icons default to `aria-hidden` — icon-only controls carry their own `aria-label`.
- Server-side logging goes through `lib/logger.ts` (pino), not `console`.
