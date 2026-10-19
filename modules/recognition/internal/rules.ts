// PRIVATE pure rules of the recognition module. No I/O, no dates from the clock.

/** Streak milestones (days) approved on 19 October 2026. */
export const DEFAULT_MILESTONES: readonly number[] = [3, 7, 14, 30, 60, 100];

/**
 * One character per Asia/Kolkata day, as returned by
 * `recognition_activity_days`: `c` counts, `s` is skipped, `b` breaks.
 */
export type DayCode = 'c' | 's' | 'b';
export type DayState = 'active' | 'skipped' | 'broken' | 'pending';

export interface StreakDay {
  date: string;
  state: DayState;
}

export interface StreakSummary {
  userId: string;
  /** Consecutive counted days ending at the latest counted day (skips bridge). */
  current: number;
  longest: number;
  /** Latest counted day, or null when nothing has counted in the window. */
  lastActiveDate: string | null;
  /** The as-of day itself has counted (logged on a Present/Half Day day). */
  todayCounted: boolean;
  /** The day that ended the current run, when the current streak is 0. */
  brokenOn: string | null;
  nextMilestone: number | null;
  daysToMilestone: number | null;
  /** Milestones the current streak has reached, lowest first. */
  reached: number[];
  /** The policy's milestones, lowest first. */
  milestones: number[];
  /** The latest `recentCount` days, oldest first. */
  recentDays: StreakDay[];
  asOf: string;
  ruleVersion: string;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isDayCode(value: string): value is DayCode {
  return value === 'c' || value === 's' || value === 'b';
}

/**
 * The approved "active day" streak over a day-code string whose last character
 * is the as-of day (normally today).
 *
 * - `c` extends the run, `s` is ignored, `b` resets it.
 * - The as-of day is still in progress: a `b` or `s` there is *pending* and
 *   neither extends nor breaks the streak; only a `c` counts it.
 * - `current` is the run ending at the latest counted day, as long as no `b`
 *   sits between that day and the as-of day.
 */
export function computeStreak(
  days: string,
  from: string,
  userId: string,
  options: { milestones?: readonly number[]; recentCount?: number; ruleVersion?: string } = {},
): StreakSummary {
  const milestones = [...(options.milestones ?? DEFAULT_MILESTONES)].filter((m) => Number.isInteger(m) && m > 0).sort((a, b) => a - b);
  const recentCount = options.recentCount ?? 14;
  const ruleVersion = options.ruleVersion ?? 'recognition-v1';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) throw new Error('Valid from date required.');
  for (const ch of days) if (!isDayCode(ch)) throw new Error(`Unknown day code "${ch}".`);
  const n = days.length;
  const asOf = n ? addDays(from, n - 1) : from;
  const todayCode: DayCode | null = n ? (days[n - 1] as DayCode) : null;
  const todayCounted = todayCode === 'c';

  // Longest run anywhere in the window. The pending as-of day only counts
  // when it already counts.
  let longest = 0;
  let run = 0;
  for (let i = 0; i < n; i += 1) {
    const code = days[i] as DayCode;
    const pending = i === n - 1 && code !== 'c';
    if (pending) break;
    if (code === 'c') {
      run += 1;
      if (run > longest) longest = run;
    } else if (code === 'b') run = 0;
  }

  // Current run: walk back from the as-of day, skipping `s` and the pending
  // as-of day, until the first `b`.
  let current = 0;
  let lastActiveDate: string | null = null;
  let brokenOn: string | null = null;
  for (let i = n - 1; i >= 0; i -= 1) {
    const code = days[i] as DayCode;
    if (i === n - 1 && code !== 'c') continue;
    if (code === 's') continue;
    if (code === 'b') {
      if (current === 0) brokenOn = addDays(from, i);
      break;
    }
    current += 1;
    if (lastActiveDate === null) lastActiveDate = addDays(from, i);
  }
  if (lastActiveDate === null) {
    const lastCounted = days.lastIndexOf('c');
    lastActiveDate = lastCounted >= 0 ? addDays(from, lastCounted) : null;
  }

  const nextMilestone = milestones.find((m) => m > current) ?? null;
  const reached = milestones.filter((m) => m <= current);
  const recentDays: StreakDay[] = [];
  for (let i = Math.max(0, n - recentCount); i < n; i += 1) {
    const code = days[i] as DayCode;
    const state: DayState = i === n - 1 && code !== 'c' ? 'pending' : code === 'c' ? 'active' : code === 's' ? 'skipped' : 'broken';
    recentDays.push({ date: addDays(from, i), state });
  }
  return {
    userId, current, longest, lastActiveDate, todayCounted, brokenOn, nextMilestone,
    daysToMilestone: nextMilestone === null ? null : nextMilestone - current, reached, milestones, recentDays, asOf, ruleVersion,
  };
}

/** Milestones crossed when a streak moves from `previous` to `current`. */
export function milestonesReached(previous: number, current: number, milestones: readonly number[] = DEFAULT_MILESTONES): number[] {
  return [...milestones].filter((m) => m > previous && m <= current).sort((a, b) => a - b);
}
