import { describe, expect, it } from 'vitest';

import { liveWindowEnd, resolvePeriod } from '@/shared/time/period';

const october = resolvePeriod(2026, 10);

describe('liveWindowEnd (live reads cover the days that have ended)', () => {
  it('ends a mid-month live read at today, so it reads through yesterday', () => {
    expect(liveWindowEnd(october, '2026-10-25T06:30:00.000Z')).toBe('2026-10-25');
  });

  it('keeps a day read at its end-of-day cutoff', () => {
    expect(liveWindowEnd(october, '2026-10-20T18:29:59.999Z')).toBe('2026-10-21');
  });

  it('reads the whole month on its first day, after it ends, and for a past month', () => {
    expect(liveWindowEnd(october, '2026-10-01T05:00:00.000Z')).toBe('2026-11-01');
    expect(liveWindowEnd(october, '2026-10-31T18:29:59.999Z')).toBe('2026-11-01');
    expect(liveWindowEnd(october, '2026-11-03T05:00:00.000Z')).toBe('2026-11-01');
  });
});
