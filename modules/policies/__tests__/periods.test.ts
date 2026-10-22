import { describe, expect, it } from 'vitest';

import { addDays, datesIn, daySpan, isOpen, periodLabel, periodOf, previousPeriod } from '@/modules/policies/internal/periods';

describe('policy periods (mirror of taskpulse_private.policy_period)', () => {
  it('keys a day, an ISO week and a month', () => {
    expect(periodOf('day', '2026-10-19')).toEqual({ kind: 'day', key: '2026-10-19', start: '2026-10-19', end: '2026-10-19' });
    expect(periodOf('week', '2026-10-22')).toEqual({ kind: 'week', key: '2026-W43', start: '2026-10-19', end: '2026-10-25' });
    expect(periodOf('week', '2026-10-25')).toMatchObject({ key: '2026-W43', start: '2026-10-19' });
    expect(periodOf('month', '2026-10-22')).toEqual({ kind: 'month', key: '2026-10', start: '2026-10-01', end: '2026-10-31' });
    expect(periodOf('month', '2028-02-10').end).toBe('2028-02-29');
  });

  it('uses the ISO week-numbering year at year boundaries', () => {
    // 1 Jan 2027 is a Friday: it belongs to 2026-W53. 31 Dec 2029 is a Monday: 2030-W01.
    expect(periodOf('week', '2027-01-01')).toMatchObject({ key: '2026-W53', start: '2026-12-28', end: '2027-01-03' });
    expect(periodOf('week', '2029-12-31')).toMatchObject({ key: '2030-W01', start: '2029-12-31' });
    expect(periodOf('week', '2026-01-01')).toMatchObject({ key: '2026-W01', start: '2025-12-29' });
  });

  it('steps back to the previous period', () => {
    expect(previousPeriod(periodOf('month', '2026-03-15')).key).toBe('2026-02');
    expect(previousPeriod(periodOf('week', '2026-01-01')).key).toBe('2025-W52');
    expect(previousPeriod(periodOf('day', '2026-03-01')).key).toBe('2026-02-28');
  });

  it('is open through its last day in Asia/Kolkata', () => {
    const october = periodOf('month', '2026-10-01');
    expect(isOpen(october, '2026-10-31')).toBe(true);
    expect(isOpen(october, '2026-11-01')).toBe(false);
  });

  it('labels periods in plain words', () => {
    expect(periodLabel(periodOf('month', '2026-10-05'))).toBe('October 2026');
    expect(periodLabel(periodOf('week', '2026-10-22'))).toBe('Week of 19 Oct (19 Oct–25 Oct)');
    expect(periodLabel(periodOf('day', '2026-10-22'))).toBe('22 Oct 2026');
  });

  it('counts and lists days, and rejects invalid dates', () => {
    expect(daySpan('2026-10-01', '2026-10-31')).toBe(31);
    expect(datesIn('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(() => periodOf('month', '2026-02-30')).toThrow();
    expect(() => periodOf('day', '22/10/2026')).toThrow();
  });
});
