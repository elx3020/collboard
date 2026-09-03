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
