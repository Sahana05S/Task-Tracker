import { describe, expect, it } from 'vitest';
import {
  computeFreshness,
  FRESHNESS_THRESHOLD_DAYS,
} from '@/lib/tracker/enums';

/**
 * Tests for the freshness decay logic.
 *
 * `computeFreshness` mirrors the CASE expression in
 * `supabase/migrations/05_freshness_decay.sql` exactly. These tests verify
 * both documents agree; if you change one, change both.
 */

const STALE_DAYS = FRESHNESS_THRESHOLD_DAYS.stale;   // 7
const ROTTEN_DAYS = FRESHNESS_THRESHOLD_DAYS.rotten; // 14

/** Build an updatedAt ISO string that is exactly `days` days before `now`. */
function daysAgo(days: number, now: Date): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

/** A fixed "now" used throughout to make every test deterministic. */
const NOW = new Date('2026-09-27T00:00:00Z');

describe('computeFreshness', () => {
  /* ---- boundary: Fresh -------------------------------------------------- */

  it('returns Fresh when updated_at is exactly now', () => {
    expect(computeFreshness(NOW.toISOString(), 'In Progress', NOW)).toBe('Fresh');
  });

  it('returns Fresh when updated within stale threshold (< 7 days)', () => {
    expect(computeFreshness(daysAgo(1, NOW), 'In Progress', NOW)).toBe('Fresh');
    expect(computeFreshness(daysAgo(6, NOW), 'In Progress', NOW)).toBe('Fresh');
  });

  it('returns Fresh at exactly the stale boundary (7 days)', () => {
    // <= 7 days → still Fresh
    expect(computeFreshness(daysAgo(STALE_DAYS, NOW), 'In Progress', NOW)).toBe('Fresh');
  });

  /* ---- boundary: Stale -------------------------------------------------- */

  it('returns Stale when updated between 7 and 14 days ago', () => {
    expect(computeFreshness(daysAgo(8, NOW), 'In Progress', NOW)).toBe('Stale');
    expect(computeFreshness(daysAgo(13, NOW), 'In Progress', NOW)).toBe('Stale');
  });

  it('returns Stale at exactly 14 days (rotten boundary, inclusive on Stale side)', () => {
    // <= 14 days → Stale  (> 7 days already established above)
    expect(computeFreshness(daysAgo(ROTTEN_DAYS, NOW), 'In Progress', NOW)).toBe('Stale');
  });

  /* ---- boundary: Rotten ------------------------------------------------- */

  it('returns Rotten when inactive for more than 14 days', () => {
    expect(computeFreshness(daysAgo(15, NOW), 'In Progress', NOW)).toBe('Rotten');
    expect(computeFreshness(daysAgo(30, NOW), 'Not Started', NOW)).toBe('Rotten');
    expect(computeFreshness(daysAgo(365, NOW), 'In Progress', NOW)).toBe('Rotten');
  });

  /* ---- terminal statuses are excluded from decay ------------------------ */

  it('returns Fresh for Done tasks regardless of age (terminal, not decayed)', () => {
    // Done tasks are excluded from the analytics that use freshness, so the
    // returned value is a sentinel — the key constraint is that it never
    // goes through the threshold logic and flips to Rotten.
    expect(computeFreshness(daysAgo(30, NOW), 'Done', NOW)).toBe('Fresh');
    expect(computeFreshness(daysAgo(365, NOW), 'Done', NOW)).toBe('Fresh');
  });

  it('returns Fresh for Discarded tasks regardless of age', () => {
    expect(computeFreshness(daysAgo(30, NOW), 'Discarded', NOW)).toBe('Fresh');
    expect(computeFreshness(daysAgo(365, NOW), 'Discarded', NOW)).toBe('Fresh');
  });

  /* ---- status coverage for non-terminal tasks --------------------------- */

  it('classifies Not Started tasks by age', () => {
    expect(computeFreshness(daysAgo(3, NOW), 'Not Started', NOW)).toBe('Fresh');
    expect(computeFreshness(daysAgo(10, NOW), 'Not Started', NOW)).toBe('Stale');
    expect(computeFreshness(daysAgo(20, NOW), 'Not Started', NOW)).toBe('Rotten');
  });

  it('classifies In Progress tasks by age', () => {
    expect(computeFreshness(daysAgo(0, NOW), 'In Progress', NOW)).toBe('Fresh');
    expect(computeFreshness(daysAgo(10, NOW), 'In Progress', NOW)).toBe('Stale');
    expect(computeFreshness(daysAgo(20, NOW), 'In Progress', NOW)).toBe('Rotten');
  });

  /* ---- default now ------------------------------------------------------- */

  it('uses the real clock when now is omitted', () => {
    // A task updated just now should always be Fresh relative to the real clock.
    const justNow = new Date().toISOString();
    expect(computeFreshness(justNow, 'In Progress')).toBe('Fresh');
  });

  /* ---- agreement with SQL thresholds ------------------------------------ */

  it('threshold constants match what the SQL migration declares', () => {
    // Changing domain-rules.md means changing these constants, the SQL CASE
    // expression, and this test — they must all agree.
    expect(STALE_DAYS).toBe(7);
    expect(ROTTEN_DAYS).toBe(14);
    expect(ROTTEN_DAYS).toBeGreaterThan(STALE_DAYS);
  });
});
