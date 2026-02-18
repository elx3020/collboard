# ╔═══════════════════════════════════════════════════════════════════════════════╗
# ║  Multi-stage Dockerfile for collboard/apps/web                              ║
# ║  Produces a minimal production image (~150MB) with:                         ║
# ║    - Next.js standalone output                                              ║
# ║    - Custom server (server.ts) for WebSocket support                        ║
# ║    - Prisma Client (generated)                                              ║
# ╚═══════════════════════════════════════════════════════════════════════════════╝

# ──────────────────────────────────────────────────────────────────────────────
# Stage 1: Install ALL dependencies (dev + prod) needed for the build
# ──────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy root workspace manifests
COPY package.json package-lock.json turbo.json ./

# Copy each workspace package.json so npm can resolve the workspace tree
COPY apps/web/package.json ./apps/web/
COPY apps/docs/package.json ./apps/docs/
COPY packages/ui/package.json ./packages/ui/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/typescript-config/package.json ./packages/typescript-config/

RUN npm ci

# ──────────────────────────────────────────────────────────────────────────────
# Stage 2: Generate Prisma Client
# ──────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS prisma
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

COPY apps/web/prisma ./apps/web/prisma
COPY apps/web/prisma.config.ts ./apps/web/prisma.config.ts
COPY apps/web/package.json ./apps/web/package.json

WORKDIR /app/apps/web
RUN npx prisma generate

# ──────────────────────────────────────────────────────────────────────────────
# Stage 3: Build the Next.js application via Turborepo
# ──────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copy installed deps + generated Prisma Client
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=prisma /app/node_modules/.prisma ./node_modules/.prisma

# Copy full source (respects .dockerignore)
COPY . .

# Build only the web app and its dependencies via Turborepo
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx turbo run build --filter=web...

# ──────────────────────────────────────────────────────────────────────────────
# Stage 4: Production runner — minimal image
# ──────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache wget

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy the standalone server output (includes node_modules needed at runtime)
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./

# Copy static assets that standalone does NOT include
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

# Copy Prisma schema (needed for prisma migrate deploy) and generated client
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/prisma ./apps/web/prisma
COPY --from=prisma --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=prisma --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# The standalone output creates apps/web/server.js which is the compiled
# custom server entry point. It includes WebSocket (Socket.io) support.
CMD ["node", "apps/web/server.js"]
