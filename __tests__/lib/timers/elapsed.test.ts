import { describe, expect, it } from 'vitest';

import {
  computeElapsedSeconds,
  computeTimerStopSummary,
  secondsToRoundedHours,
} from '@/lib/timers/elapsed';

describe('computeElapsedSeconds', () => {
  it('returns whole elapsed seconds between start and stop times', () => {
    expect(
      computeElapsedSeconds(
        new Date('2026-10-02T09:00:00.000Z'),
        new Date('2026-10-02T09:15:42.900Z'),
      ),
    ).toBe(942);
  });

  it('clamps negative or same-instant timer durations to zero', () => {
    expect(
      computeElapsedSeconds(
        new Date('2026-10-02T09:00:00.000Z'),
        new Date('2026-10-02T08:59:59.000Z'),
      ),
    ).toBe(0);
    expect(
      computeElapsedSeconds(
        new Date('2026-10-02T09:00:00.000Z'),
        new Date('2026-10-02T09:00:00.000Z'),
      ),
    ).toBe(0);
  });

  it('rounds elapsed timer seconds to two decimal hours for logs', () => {
    expect(secondsToRoundedHours(900)).toBe(0.25);
    expect(secondsToRoundedHours(1980)).toBe(0.55);
    expect(secondsToRoundedHours(-1)).toBe(0);
  });

  it('summarizes a stopped timer with seconds and hours', () => {
    expect(
      computeTimerStopSummary(
        new Date('2026-10-02T09:00:00.000Z'),
        new Date('2026-10-02T10:30:00.000Z'),
      ),
    ).toEqual({
      elapsedSeconds: 5400,
      hoursWorked: 1.5,
    });
  });
});
