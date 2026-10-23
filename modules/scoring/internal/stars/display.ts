/**
 * Presentation helpers for the daily stars and monthly award section. Pure and
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

/** "Thu 1 Oct" for a table row. Unparseable input is returned unchanged. */
export function awardDayLabel(date: string): string {
  const value = parse(date);
  if (!value) return date;
  return `${WEEKDAY.format(value)} ${value.getUTCDate()} ${MONTH.format(value)}`;
}

/**
 * Dates as short runs: consecutive days become "1–3 Oct", single days stay
 * "11 Oct", and a run across a month end reads "30 Sep – 2 Oct". Input order
 * and duplicates do not matter.
 */
export function awardDateRanges(dates: readonly string[]): string {
  const days = [...new Set(dates)].map(parse).filter((d): d is Date => d !== null).sort((a, b) => a.getTime() - b.getTime());
  const runs: [Date, Date][] = [];
  for (const day of days) {
    const last = runs.at(-1);
    if (last && day.getTime() - last[1].getTime() === 86_400_000) last[1] = day;
    else runs.push([day, day]);
  }
  return runs.map(([from, to]) => {
    const toLabel = `${to.getUTCDate()} ${MONTH.format(to)}`;
    if (from.getTime() === to.getTime()) return toLabel;
    if (from.getUTCMonth() === to.getUTCMonth()) return `${from.getUTCDate()}–${toLabel}`;
    return `${from.getUTCDate()} ${MONTH.format(from)} – ${toLabel}`;
  }).join(', ');
}

/**
 * Reason codes shared by every day that has reasons, in first-seen order. Days
 * without reasons are left out (they show their own "—"). Empty unless at
 * least two days have reasons, so a single day keeps its own explanation.
 */
export function sharedReasons(reasonLists: readonly (readonly string[] | null | undefined)[]): string[] {
  const lists = reasonLists.filter((list): list is readonly string[] => Boolean(list?.length));
  if (lists.length < 2) return [];
  const [first, ...rest] = lists;
  return [...new Set(first)].filter(code => rest.every(list => list.includes(code)));
}

/** A job error is a reason code (snake_case, optional ":detail") or free text. */
export function isReasonCode(value: string): boolean {
  return /^[a-z][a-z0-9_]*(:.*)?$/.test(value);
}
