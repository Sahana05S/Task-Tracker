import { kolkataDate, kolkataTime, localCheckTime } from '@/shared/time/kolkata';
import { monthPeriod } from '@/shared/time/period';

/**
 * What the period picker reads: a calendar month and the moment its figures
 * are read at. "latest" sends no as-of, so the server reads now (or the
 * month's end for a past month); "endOfDay" and "custom" send an explicit
 * Asia/Kolkata instant. The server still refuses a future instant.
 */
export type ReadMode = 'latest' | 'endOfDay' | 'custom';

export interface PeriodSelection {
  /** YYYY-MM */
  readonly month: string;
  readonly mode: ReadMode;
  /** YYYY-MM-DD in Asia/Kolkata, for endOfDay and custom. */
  readonly date: string;
  /** HH:MM in Asia/Kolkata, for custom. */
  readonly time: string;
}

const END_OF_DAY = '23:59:59.999';

/** The last instant of a Kolkata business date, as ISO. */
export function endOfKolkataDay(date: string): string {
  return new Date(`${date}T${END_OF_DAY}+05:30`).toISOString();
}

/**
 * The month's first and last dates, the last date that has begun by `now`
 * (for a custom time) and the last date that has ended (for end of day); both
 * stay inside the month.
 */
export function monthBounds(month: string, now = new Date()): { first: string; last: string; lastStarted: string; lastEnded: string } {
  const { startDate: first, endDate: last } = monthPeriod(month);
  const today = kolkataDate(now);
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const clamp = (date: string) => (date < first ? first : date > last ? last : date);
  return { first, last, lastStarted: clamp(today), lastEnded: clamp(yesterday) };
}

/**
 * The query string for a selection, keeping other parameters (tab, member…).
 * A day that has not ended yet reads as latest instead of a future instant.
 */
export function periodQuery(selection: PeriodSelection, keep: Readonly<Record<string, string>> = {}, now = new Date()): string {
  const params = new URLSearchParams(keep);
  params.delete('asOf');
  params.set('period', selection.month);
  const asOf = selectionInstant(selection);
  if (asOf && new Date(asOf).getTime() <= now.getTime()) params.set('asOf', asOf);
  return params.toString();
}

/** The explicit instant a selection asks for, or null for latest. */
export function selectionInstant(selection: PeriodSelection): string | null {
  if (selection.mode === 'endOfDay' && /^\d{4}-\d{2}-\d{2}$/.test(selection.date)) return endOfKolkataDay(selection.date);
  if (selection.mode !== 'custom' || !selection.time) return null;
  try { return localCheckTime(selection.date, selection.time); } catch { return null; }
}

/**
 * The picker's starting state from what the server read. The default read is
 * a moment ago (now) or the month's last instant; anything else was asked for.
 */
export function selectionFromAsOf(month: string, asOf: string, now = new Date()): PeriodSelection {
  const at = new Date(asOf);
  const date = kolkataDate(at);
  const { last, lastEnded } = monthBounds(month, now);
  const endOfDay = at.toISOString() === endOfKolkataDay(date);
  if (Math.abs(now.getTime() - at.getTime()) < 5 * 60_000 || (endOfDay && date === last)) {
    return { month, mode: 'latest', date: lastEnded, time: kolkataTime(now) };
  }
  if (endOfDay) return { month, mode: 'endOfDay', date, time: '23:59' };
  return { month, mode: 'custom', date, time: kolkataTime(at) };
}
