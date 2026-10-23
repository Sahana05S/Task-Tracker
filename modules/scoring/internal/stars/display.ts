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

/** The fields of an award day these helpers read (a subset of AwardDay). */
export interface AwardDayFacts {
  date: string;
  status: string;
  winnerId: string | null;
  reasons?: readonly string[] | null;
  jobStatus?: string | null;
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
