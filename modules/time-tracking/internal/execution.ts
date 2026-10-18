import { LOG_COLUMNS, mapDailyTaskLogs } from '@/modules/time-tracking/internal/logs/mappers';
import { mapTaskTimers, TIMER_COLUMNS } from '@/modules/time-tracking/internal/timers/mappers';
import { createClient } from '@/shared/supabase/server';
import type { DailyTaskLog, TaskTimer } from '@/types/tracker';

/** One mission's work logs (newest first, reversals excluded) and timer sessions. PRIVATE. */
export interface TaskExecution {
  readonly logs: readonly DailyTaskLog[];
  readonly timers: readonly TaskTimer[];
}

/** A missing table (42P01, before its migration) reads as empty; other errors throw. */
function rowsOrEmpty<T>({ data, error }: { data: T[] | null; error: { code?: string; message: string } | null }): T[] {
  if (error) {
    if (error.code === '42P01') return [];
    throw new Error(error.message);
  }
  return data ?? [];
}

export async function getTaskExecution(taskId: string): Promise<TaskExecution> {
  const supabase = await createClient();
  const [logResult, timerResult] = await Promise.all([
    supabase
      .from('daily_task_logs')
      .select(LOG_COLUMNS).is('reversed_at', null)
      .eq('task_id', taskId)
      .order('log_date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('task_timers')
      .select(TIMER_COLUMNS)
      .eq('task_id', taskId)
      .order('started_at', { ascending: false }),
  ]);
  return {
    logs: mapDailyTaskLogs(rowsOrEmpty(logResult)),
    timers: mapTaskTimers(rowsOrEmpty(timerResult)),
  };
}
