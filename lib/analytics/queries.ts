import {
  computeTeamAnalytics,
  currentPeriod,
  type AnalyticsPeriod,
  type TeamAnalytics,
} from '@/lib/analytics/engine';
import { LOG_COLUMNS, mapDailyTaskLogs } from '@/lib/logs/mappers';
import { mapUser, USER_COLUMNS } from '@/lib/supabase/mappers';
import { createClient } from '@/lib/supabase/server';
import { mapTasks, TASK_COLUMNS } from '@/lib/tasks/mappers';

/**
 * Server-side reads for the analytics dashboard.
 */

/**
 * Loads everything the engine needs for a period and computes the statistics.
 *
 * All three queries are issued together, so this costs one round trip of latency
 * rather than three.
 *
 * Logs are filtered to the period in SQL. Tasks are not: a task assigned in a
 * previous month can still be carried by this one, so the carry test in the
 * engine needs the full set rather than a date-sliced one.
 */
export async function getTeamAnalytics(
  period: AnalyticsPeriod = currentPeriod(),
): Promise<TeamAnalytics> {
  const supabase = await createClient();

  const [memberResult, taskResult, logResult] = await Promise.all([
    supabase.from('users').select(USER_COLUMNS).order('full_name'),
    supabase.from('tasks').select(TASK_COLUMNS),
    supabase
      .from('daily_task_logs')
      .select(LOG_COLUMNS)
      .gte('log_date', period.startDate)
      .lte('log_date', period.endDate),
  ]);

  if (memberResult.error) {
    throw new Error(`Failed to load members: ${memberResult.error.message}`);
  }
  if (taskResult.error) {
    throw new Error(`Failed to load tasks: ${taskResult.error.message}`);
  }
  if (logResult.error) {
    throw new Error(`Failed to load logs: ${logResult.error.message}`);
  }

  return computeTeamAnalytics({
    members: memberResult.data.map(mapUser),
    tasks: mapTasks(taskResult.data),
    logs: mapDailyTaskLogs(logResult.data),
    period,
  });
}

export interface StoredSnapshot {
  userId: string;
  snapshotMonth: number;
  snapshotYear: number;
  isStarPerformer: boolean;
  createdAt: string;
}

/**
 * Reads back any frozen snapshot rows for a period, so the dashboard can show
 * whether the month has already been committed.
 */
export async function getStoredSnapshots(
  period: AnalyticsPeriod,
): Promise<StoredSnapshot[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('monthly_performance_snapshots')
    .select('user_id, snapshot_month, snapshot_year, is_star_performer, created_at')
    .eq('snapshot_year', period.year)
    .eq('snapshot_month', period.month);

  if (error) {
    throw new Error(`Failed to load snapshots: ${error.message}`);
  }

  return data.map((row) => ({
    userId: row.user_id,
    snapshotMonth: row.snapshot_month,
    snapshotYear: row.snapshot_year,
    isStarPerformer: row.is_star_performer ?? false,
    createdAt: row.created_at,
  }));
}
