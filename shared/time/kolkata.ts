/**
 * Business-calendar helpers. TaskPulse runs on the Asia/Kolkata calendar for
 * launch (AGENTS.md, M15), so every "today" and business date comes from here.
 */

export const BUSINESS_TIME_ZONE = 'Asia/Kolkata' as const;

/** The Asia/Kolkata calendar date of `now`, as YYYY-MM-DD. */
export function kolkataDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/**
 * An Asia/Kolkata wall-clock time on a business date, as an ISO instant.
 * Blank time means no time recorded (null); malformed input throws.
 */
export function localCheckTime(date:string,time:string):string|null {
  if(!time) return null;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Valid local date and time required.');
  const value=new Date(`${date}T${time}:00+05:30`);
  if(!Number.isFinite(value.getTime())) throw new Error('Invalid check time.');
  return value.toISOString();
}
