/**
 * In-memory sliding window rate limiter.
 *
 * Uses a simple `Map` — suitable for single-process deployments.
 * For horizontal scaling, replace the backing store with Redis
 * (e.g. using the existing ioredis connection in lib/redis.ts).
 */

interface RateLimitEntry {
  /** Timestamps (ms) of requests within the current window */
  timestamps: number[];
}

interface RateLimiterOptions {
  /** Maximum requests allowed within the window (default 60) */
  limit?: number;
  /** Window size in seconds (default 60) */
  windowSeconds?: number;
}

const DEFAULT_LIMIT = 60;
const DEFAULT_WINDOW = 60; // seconds

const store = new Map<string, RateLimitEntry>();

// Periodic cleanup every 5 minutes to prevent memory leaks
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanupTimer() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      // Remove entries whose newest request is older than the largest window we track
      if (entry.timestamps.length === 0 || entry.timestamps[entry.timestamps.length - 1]! < now - 120_000) {
        store.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);
  // Allow the process to exit even if the timer is still running
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

/**
 * Check whether a request identified by `key` is within the rate limit.
 *
 * @returns `{ allowed, remaining, resetAt }` — `allowed` is `false` when the
 *          limit has been exceeded.
 */
export function rateLimit(
  key: string,
  options: RateLimiterOptions = {}
): { allowed: boolean; remaining: number; resetAt: number } {
  const limit = options.limit ?? DEFAULT_LIMIT;
  const windowMs = (options.windowSeconds ?? DEFAULT_WINDOW) * 1000;

  ensureCleanupTimer();

  const now = Date.now();
  const windowStart = now - windowMs;

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Trim timestamps outside the current window
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  if (entry.timestamps.length >= limit) {
    const oldestInWindow = entry.timestamps[0]!;
    return {
      allowed: false,
      remaining: 0,
      resetAt: oldestInWindow + windowMs,
    };
  }

  entry.timestamps.push(now);

  return {
    allowed: true,
    remaining: limit - entry.timestamps.length,
    resetAt: now + windowMs,
  };
}

/**
 * Extract a client identifier from a Next.js request.
 * Prefers x-forwarded-for (set by reverse proxies) then falls back to
 * x-real-ip or a generic "unknown" key.
 */
export function getClientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    'unknown'
  );
}
