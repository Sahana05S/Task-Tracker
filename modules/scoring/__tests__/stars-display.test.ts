import { describe, expect, it } from 'vitest';
import { awardDayKind, awardDayLabel, mondayIndex } from '@/modules/scoring/client';

describe('award day labels', () => {
  it('reads a calendar date without a timezone shift', () => {
    expect(awardDayLabel('2026-10-01')).toBe('Thu 1 Oct');
    expect(awardDayLabel('2026-12-31')).toBe('Thu 31 Dec');
  });
  it('returns unparseable input unchanged', () => {
    expect(awardDayLabel('soon')).toBe('soon');
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

describe('weekdays', () => {
  it('counts weekdays from Monday', () => {
    expect(mondayIndex('2026-10-05')).toBe(0);
    expect(mondayIndex('2026-10-01')).toBe(3);
    expect(mondayIndex('2026-10-04')).toBe(6);
  });
});
