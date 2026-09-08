import { describe, it, expect, afterEach, vi } from 'vitest';

// Use dynamic import so the module's internal Map resets between test files
// (Vitest module caching). For per-test isolation we rely on unique keys.
import { rateLimit, getClientIp } from '@/lib/rate-limit';

describe('rateLimit', () => {
  it('allows requests under the limit', () => {
    const key = `test-allow-${Date.now()}`;
    const result = rateLimit(key, { limit: 5, windowSeconds: 60 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('blocks requests over the limit', () => {
    const key = `test-block-${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      rateLimit(key, { limit: 3, windowSeconds: 60 });
    }
    const result = rateLimit(key, { limit: 3, windowSeconds: 60 });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('returns correct remaining count', () => {
    const key = `test-remaining-${Date.now()}`;
    const r1 = rateLimit(key, { limit: 5, windowSeconds: 60 });
    expect(r1.remaining).toBe(4);

    const r2 = rateLimit(key, { limit: 5, windowSeconds: 60 });
    expect(r2.remaining).toBe(3);
  });

  it('provides a resetAt timestamp in the future', () => {
    const key = `test-reset-${Date.now()}`;
    const result = rateLimit(key, { limit: 5, windowSeconds: 60 });
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });
});

describe('getClientIp', () => {
  it('extracts IP from x-forwarded-for', () => {
    const headers = new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' });
    expect(getClientIp(headers)).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip', () => {
    const headers = new Headers({ 'x-real-ip': '10.0.0.1' });
    expect(getClientIp(headers)).toBe('10.0.0.1');
  });

  it('returns unknown when no IP header present', () => {
    const headers = new Headers();
    expect(getClientIp(headers)).toBe('unknown');
  });
});

describe('rateLimit escape hatch', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('lets everything through when disabled outside production', () => {
        vi.stubEnv('RATE_LIMIT_DISABLED', 'true');
        const key = `test-disabled-${Date.now()}`;

        for (let i = 0; i < 10; i++) {
            expect(rateLimit(key, { limit: 3, windowSeconds: 60 }).allowed).toBe(true);
        }
    });

    it('ignores the flag in production, so a deployment cannot switch limiting off', () => {
        vi.stubEnv('RATE_LIMIT_DISABLED', 'true');
        vi.stubEnv('NODE_ENV', 'production');
        const key = `test-prod-${Date.now()}`;

        rateLimit(key, { limit: 1, windowSeconds: 60 });
        expect(rateLimit(key, { limit: 1, windowSeconds: 60 }).allowed).toBe(false);
    });

    it('limits normally when the flag is absent', () => {
        const key = `test-default-${Date.now()}`;

        rateLimit(key, { limit: 1, windowSeconds: 60 });
        expect(rateLimit(key, { limit: 1, windowSeconds: 60 }).allowed).toBe(false);
    });
});
