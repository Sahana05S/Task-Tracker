import { describe, expect, it } from 'vitest';
import { awardDayKind, awardDayLabel, awardDayView, mondayIndex, type LastDecided } from '@/modules/scoring/client';

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

describe('award day views while a day is rechecked (migration 62)', () => {
  const winner: LastDecided = { status: 'completed_winner', winnerId: 'a', runId: 'r1', decidedAt: '2026-10-06T18:30:00Z', override: false };
  const none: LastDecided = { status: 'completed_none', winnerId: null, runId: 'r2', decidedAt: null, override: false };
  const holidays = new Set(['2026-10-04']);
  it('keeps the last decided star on a stale day, marked recalculating', () => {
    expect(awardDayView({ ...day('2026-10-05', 'stale', { jobStatus: 'pending' }), lastDecided: winner }))
      .toEqual({ kind: 'awarded', winnerId: 'a', recalculating: true });
  });
  it('keeps a decided day without a winner, and a holiday stays a holiday', () => {
    expect(awardDayView({ ...day('2026-10-05', 'stale'), lastDecided: none })).toEqual({ kind: 'no_winner', winnerId: null, recalculating: true });
    expect(awardDayView({ ...day('2026-10-04', 'stale'), lastDecided: none }, holidays)).toEqual({ kind: 'holiday', winnerId: null, recalculating: true });
  });
  it('a stale day never decided reads as before', () => {
    expect(awardDayView({ ...day('2026-10-05', 'stale', { jobStatus: 'pending' }), lastDecided: null }))
      .toEqual({ kind: 'queued', winnerId: null, recalculating: false });
    expect(awardDayView(day('2026-10-05', 'stale', { reasons: ['attendance_unavailable'] })).kind).toBe('waiting');
  });
  it('a current day ignores lastDecided and shows its own result', () => {
    expect(awardDayView({ ...day('2026-10-05', 'completed_winner', { winnerId: 'b' }), lastDecided: winner }))
      .toEqual({ kind: 'awarded', winnerId: 'b', recalculating: false });
    expect(awardDayView({ ...day('2026-10-05', 'blocked', { reasons: ['attendance_unavailable'] }), lastDecided: winner }))
      .toEqual({ kind: 'waiting', winnerId: null, recalculating: false });
  });
});

describe('weekdays', () => {
  it('counts weekdays from Monday', () => {
    expect(mondayIndex('2026-10-05')).toBe(0);
    expect(mondayIndex('2026-10-01')).toBe(3);
    expect(mondayIndex('2026-10-04')).toBe(6);
  });
});
