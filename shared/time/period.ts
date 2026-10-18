/** Calendar-month periods on the Asia/Kolkata business calendar. */

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

/** The calendar month containing `now`. */
export function currentPeriod(now: Date = new Date()): AnalyticsPeriod {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit'}).formatToParts(now);
  return resolvePeriod(Number(parts.find(p=>p.type==='year')!.value),Number(parts.find(p=>p.type==='month')!.value));
}
