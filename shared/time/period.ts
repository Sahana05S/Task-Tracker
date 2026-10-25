/** Calendar-month periods on the Asia/Kolkata business calendar. */

import { kolkataDate } from './kolkata';

export interface AnalyticsPeriod {
  /** Four-digit year. */
  year: number;
  /** Calendar month, 1–12. */
  month: number;
  /** First day of the month, ISO `YYYY-MM-DD`, inclusive. */
  startDate: string;
  /** Last day of the month, ISO `YYYY-MM-DD`, inclusive. */
  endDate: string;
  /** Human label, e.g. `"September 2026"`. */
  label: string;
}

/** Builds the inclusive date range for a calendar month. */
export function resolvePeriod(year: number, month: number): AnalyticsPeriod {
  const padded = String(month).padStart(2, '0');
  // Day 0 of the next month is the last day of this one, which sidesteps
  // month-length and leap-year special cases.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    year,
    month,
    startDate: `${year}-${padded}-01`,
    endDate: `${year}-${padded}-${String(lastDay).padStart(2, '0')}`,
    label: new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
  };
}

/** Whether a value is a `YYYY-MM` month key. */
export function isMonthKey(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** The calendar month of a `YYYY-MM` key. */
export function monthPeriod(month: string): AnalyticsPeriod {
  return resolvePeriod(Number(month.slice(0, 4)), Number(month.slice(5, 7)));
}

/** A `YYYY-MM` key moved by whole months. */
export function shiftMonth(month: string, by: number): string {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1)).toISOString().slice(0, 7);
}

/** Every date of a `YYYY-MM` month. */
export function monthDates(month: string): string[] {
  const count = Number(monthPeriod(month).endDate.slice(8));
  return Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
}

/** The calendar month containing `now`. */
export function currentPeriod(now: Date = new Date()): AnalyticsPeriod {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit'}).formatToParts(now);
  return resolvePeriod(Number(parts.find(p=>p.type==='year')!.value),Number(parts.find(p=>p.type==='month')!.value));
}

/**
 * The exclusive end of a month's live reading window: only days that have ended by `asOf`
 * (India time) are read, so today's unfinished attendance never makes a score "unavailable"
 * (user decision, 25 October 2026). A read at the end of a day keeps that day; a read on the
 * month's first day, before any day has ended, keeps the whole month.
 */
export function liveWindowEnd(period: Pick<AnalyticsPeriod, 'startDate' | 'endDate'>, asOf: string): string {
  const afterMonth = new Date(`${period.endDate}T00:00:00Z`);
  afterMonth.setUTCDate(afterMonth.getUTCDate() + 1);
  const monthEnd = afterMonth.toISOString().slice(0, 10);
  const firstOpenDay = kolkataDate(new Date(new Date(asOf).getTime() + 1));
  return firstOpenDay > period.startDate && firstOpenDay < monthEnd ? firstOpenDay : monthEnd;
}
