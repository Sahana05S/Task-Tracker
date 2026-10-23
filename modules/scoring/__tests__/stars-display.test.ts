import { describe, expect, it } from 'vitest';
import { awardDateRanges, awardDayLabel, isReasonCode, sharedReasons } from '@/modules/scoring/client';

describe('award day labels', () => {
  it('reads a calendar date without a timezone shift', () => {
    expect(awardDayLabel('2026-10-01')).toBe('Thu 1 Oct');
    expect(awardDayLabel('2026-12-31')).toBe('Thu 31 Dec');
  });
  it('returns unparseable input unchanged', () => {
    expect(awardDayLabel('soon')).toBe('soon');
  });
});

describe('award date ranges', () => {
  it('joins consecutive days and keeps single days', () => {
    expect(awardDateRanges(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05'])).toBe('1–3 Oct, 5 Oct');
  });
  it('sorts and removes duplicates', () => {
    expect(awardDateRanges(['2026-10-18', '2026-10-04', '2026-10-11', '2026-10-04'])).toBe('4 Oct, 11 Oct, 18 Oct');
  });
  it('names both months for a run across a month end', () => {
    expect(awardDateRanges(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'])).toBe('29 Sep – 2 Oct');
  });
  it('covers a whole month of undecided days as one run', () => {
    const october = Array.from({ length: 22 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
    expect(awardDateRanges(october)).toBe('1–22 Oct');
  });
  it('is empty for no dates', () => {
    expect(awardDateRanges([])).toBe('');
  });
});

describe('shared reasons', () => {
  it('keeps codes every day has, in first-seen order', () => {
    expect(sharedReasons([['a', 'b', 'c'], ['c', 'a'], ['a', 'c', 'd']])).toEqual(['a', 'c']);
  });
  it('needs at least two days', () => {
    expect(sharedReasons([['a']])).toEqual([]);
  });
  it('leaves out days without reasons', () => {
    expect(sharedReasons([[], ['a', 'b'], null, ['b', 'a']])).toEqual(['a', 'b']);
    expect(sharedReasons([['a'], null])).toEqual([]);
  });
});

describe('job error kinds', () => {
  it('tells reason codes from free text', () => {
    expect(isReasonCode('required_inputs_unavailable')).toBe(true);
    expect(isReasonCode('sales_unavailable:2026-10-02')).toBe(true);
    expect(isReasonCode('Connection reset by peer')).toBe(false);
  });
});
