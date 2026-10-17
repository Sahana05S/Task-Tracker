/**
 * Business-calendar helpers. TaskPulse runs on the Asia/Kolkata calendar for
 * launch (AGENTS.md, M15), so every "today" and business date comes from here.
 */

export const BUSINESS_TIME_ZONE = 'Asia/Kolkata' as const;

/** The Asia/Kolkata calendar date of `now`, as YYYY-MM-DD. */
export function kolkataDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
