import { describe, expect, it } from 'vitest';

import { mergedDayHours } from '@/modules/time-tracking/client';

const at = (hhmm: string) => `2026-11-04T${hhmm}:00+05:30`;

describe('mergedDayHours', () => {
  it('keeps each mission\'s full time but merges the day', () => {
    const logs = [
      { hoursWorked: 4, timerSegmentStart: at('09:00'), timerSegmentEnd: at('13:00') },
      { hoursWorked: 3, timerSegmentStart: at('11:00'), timerSegmentEnd: at('14:00') },
    ];
    expect(mergedDayHours(logs)).toBe(5);
  });

  it('adds manual logs (no times) as entered and leaves days without overlaps unchanged', () => {
    expect(mergedDayHours([
      { hoursWorked: 4, timerSegmentStart: at('09:00'), timerSegmentEnd: at('13:00') },
      { hoursWorked: 3, timerSegmentStart: at('11:00'), timerSegmentEnd: at('14:00') },
      { hoursWorked: 1.5 },
    ])).toBe(6.5);
    expect(mergedDayHours([{ hoursWorked: 2.25, timerSegmentStart: null, timerSegmentEnd: null }, { hoursWorked: 1.75 }])).toBe(4);
  });
});
