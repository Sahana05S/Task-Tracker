/**
 * Presentation helpers for the award month strip. Pure and
 * timezone-free: award dates are calendar dates (YYYY-MM-DD), so they are read
 * as UTC midnights and never shifted.
 */

// en-US short names ("Sep", "Thu"), as formatDate uses elsewhere.
const MONTH = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
const WEEKDAY = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });

function parse(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const value = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(value.getTime()) ? null : value;
}

/** "Thu 1 Oct" for a day's label. Unparseable input is returned unchanged. */
export function awardDayLabel(date: string): string {
  const value = parse(date);
  if (!value) return date;
  return `${WEEKDAY.format(value)} ${value.getUTCDate()} ${MONTH.format(value)}`;
}

/* -------------------------------------------------------------------------- */
/* Day kinds                                                                  */
/* -------------------------------------------------------------------------- */

/** What a day shows: a star, a decided day without one, a holiday, or why it is open. */
export type AwardDayKind = 'awarded' | 'no_winner' | 'holiday' | 'waiting' | 'queued' | 'failed';

/**
 * A day's last decided result (migration 62): the director's override, else
 * the latest run when it certified a winner or no winner. Kept while the day
 * is stale, so views can show it until the recheck finishes.
 */
export interface LastDecided {
  status: 'completed_winner' | 'completed_none';
  winnerId: string | null;
  runId: string | null;
  decidedAt: string | null;
  override: boolean;
}

/** The fields of an award day these helpers read (a subset of AwardDay). */
export interface AwardDayFacts {
  date: string;
  status: string;
  winnerId: string | null;
  reasons?: readonly string[] | null;
  jobStatus?: string | null;
  lastDecided?: LastDecided | null;
}

const NO_WINNER_REASONS = new Set(['no_eligible_candidates', 'exact_highest_score_tie', 'no_regular_attendance_on_award_day']);

/**
 * One kind per day, in this order: a star wins over everything, then team
 * holidays, then decided-without-a-winner, failures, days waiting for data
 * (blocked, or open with reasons), and finally days only waiting to be run.
 */
export function awardDayKind(day: AwardDayFacts, holidays?: ReadonlySet<string> | null): AwardDayKind {
  if (day.status === 'completed_winner' && day.winnerId) return 'awarded';
  if (holidays?.has(day.date)) return 'holiday';
  if (day.status === 'completed_none') return 'no_winner';
  if (day.status === 'failed' || day.jobStatus === 'failed') return 'failed';
  const reasons = day.reasons ?? [];
  if (reasons.length && reasons.every(code => NO_WINNER_REASONS.has(code.split(':')[0]))) return 'no_winner';
  if (day.status === 'blocked' || reasons.length) return 'waiting';
  return 'queued';
}

/** Monday-first weekday index (0 = Monday) of a calendar date. */
export function mondayIndex(date: string): number {
  const value = parse(date);
  return value ? (value.getUTCDay() + 6) % 7 : 0;
}

/** What a day shows: its kind, the star's winner, and whether it is being rechecked. */
export interface AwardDayView {
  kind: AwardDayKind;
  winnerId: string | null;
  /** A stale day showing its last decided result until the recheck finishes. */
  recalculating: boolean;
}

/**
 * The view of one day. A stale day with a last decided result keeps showing
 * that result, marked as recalculating: a change only queues a recheck, and the
 * stored decision stands until a new run replaces it. Everything else is
 * `awardDayKind` as before. Monthly selection, the ceremony, month close and
 * points never read this: they count certified, non-stale days only.
 */
export function awardDayView(day: AwardDayFacts, holidays?: ReadonlySet<string> | null): AwardDayView {
  const last = day.status === 'stale' ? day.lastDecided : null;
  if (last) {
    const kind = awardDayKind({ date: day.date, status: last.status, winnerId: last.winnerId }, holidays);
    return { kind, winnerId: kind === 'awarded' ? last.winnerId : null, recalculating: true };
  }
  const kind = awardDayKind(day, holidays);
  return { kind, winnerId: kind === 'awarded' ? day.winnerId : null, recalculating: false };
}
