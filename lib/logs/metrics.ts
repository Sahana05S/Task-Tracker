import { eligibilityReasons } from '@/lib/tasks/contract';
import type { Task } from '@/types/tracker';
import type { DailyTaskLog, TaskCategory } from '@/types/tracker';

/**
 * The effort and productivity formulas from `domain-rules.md`, kept pure so the
 * Server Actions, the views and the tests share one implementation.
 *
 *   Scaled Progress    = Task Scale x (Progress % / 100)
 *   Task Productivity  = Scaled Progress / Total Hours Worked
 *
 * Scaled progress is a generated STORED column, so the database owns it. It is
 * reproduced here only for display, never written back.
 */

/** PostgreSQL NUMERIC scale used by every metric column in this schema. */
const NUMERIC_SCALE = 2;

/**
 * Rounds to the schema's NUMERIC scale, half away from zero, which is how
 * PostgreSQL rounds NUMERIC.
 *
 * Two traps are handled here.
 *
 * First, `Math.round` breaks ties toward positive infinity, so it disagrees with
 * PostgreSQL on negative halves. Progress and hours are non-negative, but
 * `progress_delta` may be negative for a correction, so the sign is split out
 * and the magnitude rounded.
 *
 * Second, shifting the decimal point by multiplying is not safe. `1.005` is held
 * as 1.00499999999999989, so `1.005 * 100` is 100.49999999999999 — just below
 * the tie — and rounds down to 1.00 where PostgreSQL gives 1.01. Shifting
 * through the decimal string instead (`1.005e2`) parses to exactly 100.5 and
 * rounds up as it should.
 */
export function roundToNumericScale(
  value: number,
  digits = NUMERIC_SCALE,
): number {
  if (!Number.isFinite(value)) return value;

  const sign = value < 0 ? -1 : 1;
  const magnitude = Math.abs(value);
  const factor = 10 ** digits;

  const asString = String(magnitude);

  // Very large or very small magnitudes stringify in exponential form, which
  // cannot take a second exponent. Nothing in this schema reaches that range,
  // but fall back rather than produce NaN.
  if (asString.includes('e') || asString.includes('E')) {
    return (sign * Math.round(magnitude * factor)) / factor;
  }

  return (sign * Math.round(Number(`${asString}e${digits}`))) / factor;
}

/** Constrains a percentage to the CHECK range on `tasks.progress_percentage`. */
export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, roundToNumericScale(value)));
}

/**
 * Applies a log's delta to a task's current progress.
 *
 * Additive rather than derived from the sum of all deltas, because progress is
 * also directly editable in the task grid. Recomputing it from log history would
 * silently discard those manual corrections.
 */
export function applyProgressDelta(
  current: number | null,
  delta: number,
): number {
  return clampProgress((current ?? 0) + delta);
}

/**
 * Scaled Progress = Task Scale x (Progress % / 100).
 *
 * Returns `null` when either operand is unset, matching the generated column,
 * which resolves to NULL if either input is NULL.
 */
export function computeScaledProgress(
  taskScale: number | null,
  progressPercentage: number | null,
): number | null {
  if (taskScale === null || progressPercentage === null) return null;
  return taskScale * progressPercentage / 100;
}

/**
 * Task productivity = progress percentage points / total hours worked.
 *
 * Returns `null` when it cannot be computed rather than 0. Zero productivity
 * means "worked and produced nothing"; no logged hours means the rate is
 * undefined, and conflating the two would drag the team median down with tasks
 * nobody has started.
 */
export function computeProductivity(
  progressPercentage: number | null,
  hoursLogged: number,
): number | null {
  if (progressPercentage === null) return null;
  if (!Number.isFinite(hoursLogged) || hoursLogged <= 0) return null;
  return roundToNumericScale(progressPercentage / hoursLogged);
}

/**
 * Metrics eligibility, per the integrity rules in `domain-rules.md`: hours
 * logged must exceed zero AND task scale must exceed zero, and off-hours
 * entries are excluded outright.
 */
export function isMetricsEligible(task: Pick<Task,'priority'|'status'|'taskScale'|'progressPercentage'>): boolean { return eligibilityReasons(task).length===0; }

/** Total hours across a set of logs, rounded to the column's scale. */
export function sumHours(logs: readonly { hoursWorked: number }[]): number {
  return logs.reduce((total, log) => total + log.hoursWorked, 0);
}

/** Total progress delta across a set of logs. */
export function sumProgressDelta(
  logs: readonly { progressDelta: number | null }[],
): number {
  return roundToNumericScale(
    logs.reduce((total, log) => total + (log.progressDelta ?? 0), 0),
  );
}

/* -------------------------------------------------------------------------- */
/* Per-task aggregates                                                        */
/* -------------------------------------------------------------------------- */

export interface TaskEffort {
  /** Sum of `hours_worked` across every log on the task. */
  hoursLogged: number;
  /** Number of log entries. */
  logCount: number;
}

export const EMPTY_EFFORT: TaskEffort = { hoursLogged: 0, logCount: 0 };

/**
 * Aggregates logs into per-task effort totals.
 *
 * Done in application code because PostgREST cannot express GROUP BY. At team
 * scale the log table is small enough to fold in one pass; promote this to a
 * database view with `security_invoker` if it outgrows a single fetch.
 */
export function aggregateEffortByTask(
  logs: readonly Pick<DailyTaskLog, 'taskId' | 'hoursWorked'>[],
): Map<string, TaskEffort> {
  const totals = new Map<string, TaskEffort>();

  for (const log of logs) {
    const current = totals.get(log.taskId) ?? EMPTY_EFFORT;
    totals.set(log.taskId, {
      hoursLogged: current.hoursLogged + log.hoursWorked,
      logCount: current.logCount + 1,
    });
  }

  // Round once per task rather than on every addition, so a long run of 0.33
  // hour entries does not accumulate rounding drift.
  for (const [taskId, effort] of totals) {
    totals.set(taskId, {
      hoursLogged: roundToNumericScale(effort.hoursLogged),
      logCount: effort.logCount,
    });
  }

  return totals;
}

/* -------------------------------------------------------------------------- */
/* Grouping for the history view                                              */
/* -------------------------------------------------------------------------- */

export interface LogDateGroup {
  /** ISO date, `YYYY-MM-DD`. */
  logDate: string;
  logs: DailyTaskLog[];
  totalHours: number;
  totalProgressDelta: number;
}

/**
 * Groups logs into descending date buckets for the history timeline.
 *
 * Within a day, entries are ordered newest-created first so a correction made
 * later in the day reads as the most recent line.
 */
export function groupLogsByDate(
  logs: readonly DailyTaskLog[],
): LogDateGroup[] {
  const buckets = new Map<string, DailyTaskLog[]>();

  for (const log of logs) {
    const bucket = buckets.get(log.logDate);
    if (bucket) {
      bucket.push(log);
    } else {
      buckets.set(log.logDate, [log]);
    }
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([logDate, entries]) => {
      const ordered = [...entries].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );

      return {
        logDate,
        logs: ordered,
        totalHours: sumHours(ordered),
        totalProgressDelta: sumProgressDelta(ordered),
      };
    });
}
