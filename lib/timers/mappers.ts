import type { TaskTimerRow } from '@/types/database';
import type { TaskTimer } from '@/types/tracker';

export const TIMER_COLUMNS =
  'id, task_id, user_id, status, started_at, stopped_at, elapsed_seconds, generated_log_id, notes, created_at, updated_at, execution_version' as const;

export function mapTaskTimer(row: TaskTimerRow): TaskTimer {
  return {
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    status: row.status,
    executionVersion: row.execution_version ?? 0,
    startedAt: row.started_at,
    stoppedAt: row.stopped_at,
    elapsedSeconds: row.elapsed_seconds,
    generatedLogId: row.generated_log_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapTaskTimers(rows: readonly TaskTimerRow[]): TaskTimer[] {
  return rows.map(mapTaskTimer);
}
