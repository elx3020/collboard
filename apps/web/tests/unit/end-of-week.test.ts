import { describe, it, expect } from 'vitest';
import { endOfIsoWeek } from '@/lib/utils/end-of-week';

describe('endOfIsoWeek', () => {
  it('rolls a Monday forward to the Sunday that ends its week', () => {
    const result = endOfIsoWeek(new Date('2026-09-07T09:15:00.000Z'));
    expect(result.toISOString()).toBe('2026-09-13T23:59:59.999Z');
  });

  it('rolls a midweek day forward to the same Sunday', () => {
    const result = endOfIsoWeek(new Date('2026-09-09T23:00:00.000Z'));
    expect(result.toISOString()).toBe('2026-09-13T23:59:59.999Z');
  });

  it('rolls a Saturday forward by one day', () => {
    const result = endOfIsoWeek(new Date('2026-09-12T00:00:00.000Z'));
    expect(result.toISOString()).toBe('2026-09-13T23:59:59.999Z');
  });

  it('keeps a Sunday in its own week rather than adding seven days', () => {
    const result = endOfIsoWeek(new Date('2026-09-13T00:00:01.000Z'));
    expect(result.toISOString()).toBe('2026-09-13T23:59:59.999Z');
  });

  it('treats the previous Sunday as ending the previous week', () => {
    const result = endOfIsoWeek(new Date('2026-09-06T18:00:00.000Z'));
    expect(result.toISOString()).toBe('2026-09-06T23:59:59.999Z');
  });

  it('does not mutate its argument', () => {
    const input = new Date('2026-09-07T09:15:00.000Z');
    endOfIsoWeek(input);
    expect(input.toISOString()).toBe('2026-09-07T09:15:00.000Z');
  });
});
