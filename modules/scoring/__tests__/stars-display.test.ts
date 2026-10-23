import { describe, expect, it } from 'vitest';
import { awardDateRanges, awardDayKind, awardDayLabel, awardGroupLabel, groupAwardDays, isReasonCode, mondayIndex, reasonChips } from '@/modules/scoring/client';

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

describe('job error kinds', () => {
  it('tells reason codes from free text', () => {
    expect(isReasonCode('required_inputs_unavailable')).toBe(true);
    expect(isReasonCode('sales_unavailable:2026-10-02')).toBe(true);
    expect(isReasonCode('Connection reset by peer')).toBe(false);
  });
});

const day = (date: string, status: string, extra: Partial<{ winnerId: string | null; reasons: string[] | null; jobStatus: string | null }> = {}) =>
  ({ date, status, winnerId: null, reasons: null, jobStatus: null, ...extra });

describe('award day kinds', () => {
  const holidays = new Set(['2026-10-04']);
  it('puts a star ahead of everything, then holidays', () => {
    expect(awardDayKind(day('2026-10-04', 'completed_winner', { winnerId: 'a' }), holidays)).toBe('awarded');
    expect(awardDayKind(day('2026-10-04', 'stale', { reasons: ['no_eligible_candidates'] }), holidays)).toBe('holiday');
  });
  it('tells decided, failed, waiting and queued days apart', () => {
    expect(awardDayKind(day('2026-10-05', 'completed_none'))).toBe('no_winner');
    expect(awardDayKind(day('2026-10-05', 'stale', { reasons: ['no_eligible_candidates'] }))).toBe('no_winner');
    expect(awardDayKind(day('2026-10-05', 'stale', { jobStatus: 'failed' }))).toBe('failed');
    expect(awardDayKind(day('2026-10-05', 'failed'))).toBe('failed');
    expect(awardDayKind(day('2026-10-05', 'blocked'))).toBe('waiting');
    expect(awardDayKind(day('2026-10-05', 'stale', { reasons: ['attendance_unavailable'] }))).toBe('waiting');
    expect(awardDayKind(day('2026-10-05', 'stale', { jobStatus: 'pending' }))).toBe('queued');
    expect(awardDayKind(day('2026-10-05', 'missing'))).toBe('queued');
  });
  it('without a holiday list a holiday date reads by its status', () => {
    expect(awardDayKind(day('2026-10-04', 'stale', { reasons: ['no_eligible_candidates'] }))).toBe('no_winner');
  });
});

describe('reason chips', () => {
  it('merges related codes into one chip each and drops the generic one', () => {
    expect(reasonChips(['required_inputs_unavailable', 'attendance_unavailable', 'attendance_evidence_unavailable',
      'raw_input_unavailable', 'member_excluded_from_factor_cohort', 'factor_median_unavailable']).map(c => c.key))
      .toEqual(['attendance', 'comparison']);
  });
  it('keeps the generic chip when it is the only reason', () => {
    expect(reasonChips(['required_inputs_unavailable']).map(c => c.key)).toEqual(['inputs']);
  });
  it('orders chips and keeps unknown codes as their own chip', () => {
    expect(reasonChips(['some_new_reason', 'sales_flags_missing:abc', 'exact_highest_score_tie'])).toEqual([
      { key: 'sales', code: 'sales_flags_missing' },
      { key: 'tie', code: 'exact_highest_score_tie' },
      { key: 'other', code: 'some_new_reason' },
    ]);
  });
  it('is empty without reasons', () => {
    expect(reasonChips(null)).toEqual([]);
  });
});

describe('grouping award days', () => {
  const waiting = ['attendance_unavailable', 'required_inputs_unavailable'];
  it('joins consecutive days that read the same, in date order', () => {
    const groups = groupAwardDays([
      day('2026-10-03', 'stale', { reasons: waiting }),
      day('2026-10-02', 'stale', { reasons: waiting }),
      day('2026-10-01', 'stale'),
      day('2026-10-04', 'stale', { reasons: ['no_eligible_candidates'] }),
      day('2026-10-05', 'stale', { reasons: waiting }),
      day('2026-10-06', 'stale', { reasons: [...waiting, 'sales_flags_missing'] }),
    ], new Set(['2026-10-04']));
    expect(groups.map(g => [g.from, g.to, g.kind, g.days.length])).toEqual([
      ['2026-10-01', '2026-10-01', 'queued', 1],
      ['2026-10-02', '2026-10-03', 'waiting', 2],
      ['2026-10-04', '2026-10-04', 'holiday', 1],
      ['2026-10-05', '2026-10-05', 'waiting', 1],
      ['2026-10-06', '2026-10-06', 'waiting', 1],
    ]);
  });
  it('never joins starred days, even with the same winner', () => {
    const groups = groupAwardDays([
      day('2026-10-07', 'completed_winner', { winnerId: 'a' }),
      day('2026-10-08', 'completed_winner', { winnerId: 'a' }),
    ]);
    expect(groups).toHaveLength(2);
  });
  it('does not join across a gap in the dates', () => {
    expect(groupAwardDays([day('2026-10-01', 'blocked'), day('2026-10-03', 'blocked')])).toHaveLength(2);
  });
});

describe('group labels and weekdays', () => {
  it('labels single days and runs', () => {
    expect(awardGroupLabel('2026-10-01', '2026-10-01')).toBe('Thu 1 Oct');
    expect(awardGroupLabel('2026-10-02', '2026-10-03')).toBe('Fri 2 – Sat 3 Oct');
    expect(awardGroupLabel('2026-09-30', '2026-10-02')).toBe('Wed 30 Sep – Fri 2 Oct');
  });
  it('counts weekdays from Monday', () => {
    expect(mondayIndex('2026-10-05')).toBe(0);
    expect(mondayIndex('2026-10-01')).toBe(3);
    expect(mondayIndex('2026-10-04')).toBe(6);
  });
});
