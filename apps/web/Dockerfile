# ╔═══════════════════════════════════════════════════════════════════════════════╗
# ║  Multi-stage Dockerfile for collboard/apps/web                              ║
# ║  Produces a minimal production image with:                                  ║
# ║    - Next.js standalone output (server.js)                                  ║
# ║    - Standalone WebSocket server (ws-server.mjs)                            ║
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

RUN npm ci --loglevel verbose

# ──────────────────────────────────────────────────────────────────────────────
# Stage 2: Generate Prisma Client
# ──────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS prisma
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY apps/web/prisma ./apps/web/prisma
COPY apps/web/prisma.config.ts ./apps/web/prisma.config.ts
COPY apps/web/package.json ./apps/web/package.json

WORKDIR /app/apps/web
RUN npx prisma generate

# ──────────────────────────────────────────────────────────────────────────────
# Stage 3: Build the Next.js application + bundle WS server
# ──────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copy installed deps + generated Prisma Client
COPY --from=deps /app/node_modules ./node_modules
COPY --from=prisma /app/node_modules/.prisma ./node_modules/.prisma

# Copy full source (respects .dockerignore)
COPY . .

# Build only the web app and its dependencies via Turborepo
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx turbo run build --filter=web...

# Bundle the standalone WS server into a single .mjs file
# so the runner stage doesn't need tsx or devDependencies.
RUN cd apps/web && npx esbuild ws-server.ts \
      --bundle \
      --platform=node \
      --format=cjs \
      --outfile=ws-server.cjs

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

# Copy the bundled WS server
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/ws-server.cjs ./apps/web/ws-server.cjs

# Copy entrypoint script
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/entrypoint.sh ./apps/web/entrypoint.sh
RUN chmod +x ./apps/web/entrypoint.sh

USER nextjs

EXPOSE 3000 3002

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV WS_PORT=3002

# Run both Next.js standalone server and WS server via entrypoint
CMD ["./apps/web/entrypoint.sh"]
