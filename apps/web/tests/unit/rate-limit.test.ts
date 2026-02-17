import { describe, it, expect, beforeEach } from 'vitest';

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
