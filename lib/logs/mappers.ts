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
  'id, task_id, user_id, log_date, hours_worked, progress_delta, update_notes, raw_links, created_at' as const;

export function mapDailyTaskLog(row: DailyTaskLogRow): DailyTaskLog {
  return {
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    logDate: row.log_date,
    hoursWorked: row.hours_worked,
    progressDelta: row.progress_delta,
    updateNotes: row.update_notes,
    rawLinks: row.raw_links,
    createdAt: row.created_at,
  };
}

export function mapDailyTaskLogs(
  rows: readonly DailyTaskLogRow[],
): DailyTaskLog[] {
  return rows.map(mapDailyTaskLog);
}
