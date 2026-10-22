// PRIVATE. Policy periods. Mirrors taskpulse_private.policy_period (migration
// 56): a day, an ISO week (Monday to Sunday, key 2026-W43) or a calendar month.
import type { Period, PeriodKind } from './types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function parse(date: string): Date {
  if (!ISO_DATE.test(date)) throw new Error(`Valid date required, got "${date}".`);
  const value = new Date(date + 'T00:00:00Z');
  if (!Number.isFinite(value.getTime()) || value.toISOString().slice(0, 10) !== date) throw new Error(`Valid date required, got "${date}".`);
  return value;
}
const iso = (value: Date) => value.toISOString().slice(0, 10);

export function addDays(date: string, days: number): string {
  const value = parse(date);
  value.setUTCDate(value.getUTCDate() + days);
  return iso(value);
}

/** Inclusive day count between two dates. */
export function daySpan(start: string, end: string): number {
  return Math.round((parse(end).getTime() - parse(start).getTime()) / 86_400_000) + 1;
}

/** ISO week-numbering year and week of a Monday. */
function isoWeek(monday: Date): { year: number; week: number } {
  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  return { year, week: Math.floor((thursday.getTime() - jan1) / (7 * 86_400_000)) + 1 };
}

export function periodOf(kind: PeriodKind, date: string): Period {
  const day = parse(date);
  if (kind === 'day') return { kind, key: date, start: date, end: date };
  if (kind === 'week') {
    const monday = new Date(day);
    monday.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
    const { year, week } = isoWeek(monday);
    const start = iso(monday);
    return { kind, key: `${year}-W${String(week).padStart(2, '0')}`, start, end: addDays(start, 6) };
  }
  const start = `${date.slice(0, 7)}-01`;
  const next = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 1));
  next.setUTCDate(0);
  return { kind, key: date.slice(0, 7), start, end: iso(next) };
}

export function previousPeriod(period: Period): Period {
  return periodOf(period.kind, addDays(period.start, -1));
}

/** A period is open until its last day has passed in Asia/Kolkata. */
export function isOpen(period: Pick<Period, 'end'>, today: string): boolean {
  return period.end >= today;
}

export function datesIn(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

function short(date: string): string {
  const d = parse(date);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "21 Oct 2026", "Week of 19 Oct (19–25 Oct)", "October 2026". */
export function periodLabel(period: Pick<Period, 'kind' | 'start' | 'end'>): string {
  const d = parse(period.start);
  if (period.kind === 'day') return `${short(period.start)} ${d.getUTCFullYear()}`;
  if (period.kind === 'week') return `Week of ${short(period.start)} (${short(period.start)}–${short(period.end)})`;
  return `${LONG_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function shortDate(date: string): string {
  return short(date);
}

export const PERIOD_LABELS: Record<PeriodKind, { noun: string; adjective: string }> = {
  day: { noun: 'day', adjective: 'Daily' },
  week: { noun: 'week', adjective: 'Weekly' },
  month: { noun: 'month', adjective: 'Monthly' },
};
