import type { DailyTaskLogRow } from '@/types/database';
import type { DailyTaskLog } from '@/types/tracker';

/**
 * Converts snake_case `daily_task_logs` rows into the camelCase
 * `DailyTaskLog` domain model.
 *
 * `hours_worked` is NOT NULL in the schema, so it maps to a plain `number`.
 * `progress_delta` and `raw_links` are nullable and stay nullable: an absent
 * link array is different information from an empty one.
 */

/** Explicit column list for log selects. */
export const LOG_COLUMNS =
  'id, task_id, user_id, log_date, hours_worked, progress_delta, update_notes, raw_links, log_source, source_timer_id, created_at, requested_progress_delta, effective_progress_delta, execution_version, reversed_at, timer_segment_number, timer_duration_seconds, credit_shares, credit_scale' as const;

export function mapDailyTaskLog(row: DailyTaskLogRow): DailyTaskLog {
  return {
    id: row.id,
    timerSegmentNumber:row.timer_segment_number,
    timerDurationSeconds:row.timer_duration_seconds,
    taskId: row.task_id,
    userId: row.user_id,
    logDate: row.log_date,
    hoursWorked: row.hours_worked,
    progressDelta: row.effective_progress_delta === undefined ? row.progress_delta : row.effective_progress_delta,
    requestedProgressDelta: row.requested_progress_delta ?? row.progress_delta,
    effectiveProgressDelta: row.effective_progress_delta,
    effectUnknown: row.effective_progress_delta === null && (row.progress_delta ?? 0)!==0,
    executionVersion: row.execution_version ?? 0,
    reversedAt: row.reversed_at,
    creditShares: row.credit_shares as Record<string, number> | null,
    creditScale: row.credit_scale,
    updateNotes: row.update_notes,
    rawLinks: row.raw_links,
    logSource: row.log_source,
    sourceTimerId: row.source_timer_id,
    createdAt: row.created_at,
  };
}

export function mapDailyTaskLogs(
  rows: readonly DailyTaskLogRow[],
): DailyTaskLog[] {
  return rows.map(mapDailyTaskLog);
}
