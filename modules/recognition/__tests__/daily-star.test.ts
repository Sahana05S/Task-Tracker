import { describe, expect, it } from 'vitest';
import { dailyStarHighlight, type DailyStarSource } from '@/modules/recognition/client';

const DATE = '2026-10-18';
const POLICY = { cutoffHour: 23, cutoffMinute: 59 };

type Day = DailyStarSource['days'][number];
const day = (over: Partial<Day>): Day => ({ date: DATE, status: 'completed_winner', certified: true, winnerId: 'u1', reasons: [], ...over });
const source = (days: Day[], over: Partial<DailyStarSource> = {}): DailyStarSource => ({ days, policyApproved: true, policy: POLICY, ...over });

describe('dailyStarHighlight (yesterday\'s M08 daily star as a highlight)', () => {
  it('names the viewer as the winner of a certified completed_winner day', () => {
    const h = dailyStarHighlight(source([day({})]), DATE, 'u1');
    expect(h).toEqual({ date: DATE, status: 'winner', winnerId: 'u1', isViewer: true, reasons: [], cutoff: { hour: 23, minute: 59 }, policyApproved: true, recalculating: false });
  });

  it('keeps the last decided star of a stale day, marked recalculating (migration 62)', () => {
    const stale = { status: 'stale', certified: false, winnerId: null, reasons: [] };
    const h = dailyStarHighlight(source([day({ ...stale, lastDecided: { status: 'completed_winner', winnerId: 'u1' } })]), DATE, 'u1');
    expect(h).toMatchObject({ status: 'winner', winnerId: 'u1', isViewer: true, recalculating: true, reasons: [] });
    const none = dailyStarHighlight(source([day({ ...stale, lastDecided: { status: 'completed_none', winnerId: null } })]), DATE, 'u1');
    expect(none).toMatchObject({ status: 'none', isViewer: false, recalculating: true });
    const never = dailyStarHighlight(source([day({ ...stale, lastDecided: null })]), DATE, 'u1');
    expect(never).toMatchObject({ status: 'blocked', recalculating: false, reasons: ['award_run_uncertified'] });
  });

  it('names another member as the winner without marking the viewer', () => {
    const h = dailyStarHighlight(source([day({ winnerId: 'u2' })]), DATE, 'u1');
    expect(h.status).toBe('winner');
    expect(h.winnerId).toBe('u2');
    expect(h.isViewer).toBe(false);
  });

  it('reports a certified completed_none day as none, carrying its reasons', () => {
    const h = dailyStarHighlight(source([day({ status: 'completed_none', winnerId: null, reasons: ['exact_highest_score_tie'] })]), DATE, 'u1');
    expect(h.status).toBe('none');
    expect(h.winnerId).toBeUndefined();
    expect(h.isViewer).toBe(false);
    expect(h.reasons).toEqual(['exact_highest_score_tie']);
  });

  it('reports a blocked run as blocked with the run\'s own reasons (sales unmapped today)', () => {
    const reasons = ['shared_calculation_incomplete', 'sales_field_mapping_missing'];
    const h = dailyStarHighlight(source([day({ status: 'blocked', certified: false, winnerId: null, reasons })]), DATE, 'u1');
    expect(h.status).toBe('blocked');
    expect(h.reasons).toEqual(reasons);
    expect(h.winnerId).toBeUndefined();
  });

  it('never shows an uncertified winner as a win', () => {
    const h = dailyStarHighlight(source([day({ certified: false })]), DATE, 'u1');
    expect(h.status).toBe('blocked');
    expect(h.isViewer).toBe(false);
    expect(h.winnerId).toBeUndefined();
    expect(h.reasons).toEqual(['award_run_uncertified']);
  });

  it('names a failed, stale or missing run by its state when it has no reasons', () => {
    for (const status of ['failed', 'stale', 'missing']) {
      const h = dailyStarHighlight(source([day({ status, winnerId: null, reasons: null })]), DATE, 'u1');
      expect(h.status).toBe('blocked');
      expect(h.reasons).toEqual([`award_run_${status}`]);
    }
  });

  it('is pending when no slot exists for the date', () => {
    const h = dailyStarHighlight(source([day({ date: '2026-10-17' })]), DATE, 'u1');
    expect(h.status).toBe('pending');
    expect(h.reasons).toEqual([]);
    expect(h.isViewer).toBe(false);
  });

  it('keeps the policy state and a null cutoff when no policy is approved', () => {
    const h = dailyStarHighlight(source([], { policyApproved: false, policy: null }), DATE, 'u1');
    expect(h.policyApproved).toBe(false);
    expect(h.cutoff).toBeNull();
    expect(h.status).toBe('pending');
  });

  it('defaults a missing cutoff minute to 0 and ignores a malformed cutoff', () => {
    expect(dailyStarHighlight(source([], { policy: { cutoffHour: 18 } }), DATE, 'u1').cutoff).toEqual({ hour: 18, minute: 0 });
    expect(dailyStarHighlight(source([], { policy: { cutoffHour: '18' } }), DATE, 'u1').cutoff).toBeNull();
  });
});
