/**
 * Time intervals and their union (user decision, 4 November 2026: several
 * mission timers may run at once; each mission keeps its full time, but a
 * person's productive hours for a day are the MERGED time of all timers, so
 * 09:00-13:00 and 11:00-14:00 make 5 h, not 7 h). Pure; client safe.
 */

/** A half-open interval [start, end). Strings are ISO timestamps; numbers are epoch milliseconds. */
export interface TimeInterval {
  start: string | number | Date;
  end: string | number | Date;
}

function millis(value: string | number | Date): number {
  return typeof value === 'number' ? value : new Date(value).getTime();
}

/** Seconds covered by the union of the intervals: overlaps count once; empty or invalid intervals count nothing. */
export function mergedSeconds(intervals: readonly TimeInterval[]): number {
  const spans = intervals
    .map((interval) => [millis(interval.start), millis(interval.end)] as const)
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let open: number | null = null;
  let close = 0;
  for (const [start, end] of spans) {
    if (open === null || start > close) {
      if (open !== null) total += close - open;
      open = start;
      close = end;
    } else if (end > close) close = end;
  }
  if (open !== null) total += close - open;
  return total / 1000;
}

/** Seconds counted more than once when the intervals are summed one by one (sum of lengths minus the union). */
export function overlapSeconds(intervals: readonly TimeInterval[]): number {
  const summed = intervals.reduce((total, interval) => {
    const length = millis(interval.end) - millis(interval.start);
    return Number.isFinite(length) && length > 0 ? total + length : total;
  }, 0) / 1000;
  return summed - mergedSeconds(intervals);
}

/** Clips an interval to [from, to); null when nothing of it is left. */
export function clipInterval(interval: TimeInterval, from: string | number | Date, to: string | number | Date): { start: number; end: number } | null {
  const start = Math.max(millis(interval.start), millis(from));
  const end = Math.min(millis(interval.end), millis(to));
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
}
