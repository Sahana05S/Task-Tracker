import { describe, expect, it } from 'vitest';

import { clipInterval, mergedSeconds, overlapSeconds } from '@/shared/time/intervals';

const at = (hhmm: string) => `2026-11-04T${hhmm}:00+05:30`;
const HOUR = 3600;

describe('mergedSeconds (several timers at once, user decision 4 November 2026)', () => {
  it('counts 09:00-13:00 and 11:00-14:00 as 5 h, not 7 h', () => {
    const timers = [{ start: at('09:00'), end: at('13:00') }, { start: at('11:00'), end: at('14:00') }];
    expect(mergedSeconds(timers)).toBe(5 * HOUR);
    expect(overlapSeconds(timers)).toBe(2 * HOUR);
  });

  it('adds separate intervals, touches without double counting, and nests', () => {
    expect(mergedSeconds([{ start: at('09:00'), end: at('10:00') }, { start: at('11:00'), end: at('12:00') }])).toBe(2 * HOUR);
    expect(mergedSeconds([{ start: at('09:00'), end: at('10:00') }, { start: at('10:00'), end: at('11:00') }])).toBe(2 * HOUR);
    expect(mergedSeconds([{ start: at('09:00'), end: at('17:00') }, { start: at('10:00'), end: at('11:00') }, { start: at('12:00'), end: at('13:00') }])).toBe(8 * HOUR);
  });

  it('ignores empty, reversed and invalid intervals and is order independent', () => {
    expect(mergedSeconds([])).toBe(0);
    expect(mergedSeconds([{ start: at('10:00'), end: at('09:00') }, { start: 'not a date', end: at('09:00') }])).toBe(0);
    const a = [{ start: at('13:00'), end: at('15:00') }, { start: at('09:00'), end: at('14:00') }, { start: at('16:00'), end: at('17:00') }];
    expect(mergedSeconds(a)).toBe(7 * HOUR);
    expect(mergedSeconds([...a].reverse())).toBe(7 * HOUR);
  });

  it('clips an interval to a window', () => {
    expect(clipInterval({ start: at('09:00'), end: at('13:00') }, at('11:00'), at('16:00'))).toEqual({ start: Date.parse(at('11:00')), end: Date.parse(at('13:00')) });
    expect(clipInterval({ start: at('09:00'), end: at('10:00') }, at('11:00'), at('16:00'))).toBeNull();
  });
});
