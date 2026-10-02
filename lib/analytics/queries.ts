import {
  computeTeamAnalytics,
  currentPeriod,
  type AnalyticsPeriod,
  type TeamAnalytics,
} from '@/lib/analytics/engine';
import {
  buildWorkbookDashboardCharts,
  type WorkbookDashboardCharts,
} from '@/lib/analytics/dashboard-charts';
import {
  ATTENDANCE_COLUMNS,
  mapAttendanceRecords,
} from '@/lib/attendance/mappers';
import { LOG_COLUMNS, mapDailyTaskLogs } from '@/lib/logs/mappers';
import { mapUser, USER_COLUMNS } from '@/lib/supabase/mappers';
import { createClient } from '@/lib/supabase/server';
import {
  mapTasks,
  TASK_COLUMNS,
  withTaskParticipants,
} from '@/lib/tasks/mappers';
import type { AttendanceRecord, DailyTaskLog, Task, User } from '@/types/tracker';

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
  const source = await getAnalyticsSource(period);

  return computeTeamAnalytics(source);
}

export interface WorkbookDashboardData {
  analytics: TeamAnalytics;
  charts: WorkbookDashboardCharts;
}

export async function getWorkbookDashboard(
  period: AnalyticsPeriod = currentPeriod(),
): Promise<WorkbookDashboardData> {
  const source = await getAnalyticsSource(period);
  const analytics = computeTeamAnalytics(source);

  return {
    analytics,
    charts: buildWorkbookDashboardCharts({
      analytics,
      members: source.members,
      tasks: source.tasks,
      period,
    }),
  };
}

interface AnalyticsSource {
  members: User[];
  tasks: Task[];
  logs: DailyTaskLog[];
  attendanceRecords: AttendanceRecord[];
  period: AnalyticsPeriod;
}

async function getAnalyticsSource(
  period: AnalyticsPeriod,
): Promise<AnalyticsSource> {
  const supabase = await createClient();

  const [memberResult, taskResult, assigneeResult, logResult, attendanceResult] = await Promise.all([
    supabase.from('users').select(USER_COLUMNS).order('full_name'),
    supabase.from('tasks').select(TASK_COLUMNS),
    supabase.from('task_assignees').select('task_id, user_id, is_primary'),
    supabase
      .from('daily_task_logs')
      .select(LOG_COLUMNS)
      .gte('log_date', period.startDate)
      .lte('log_date', period.endDate),
    supabase
      .from('attendance_records')
      .select(ATTENDANCE_COLUMNS)
      .gte('attendance_date', period.startDate)
      .lte('attendance_date', period.endDate),
  ]);

  if (memberResult.error) {
    throw new Error(`Failed to load members: ${memberResult.error.message}`);
  }
  if (taskResult.error) {
    throw new Error(`Failed to load tasks: ${taskResult.error.message}`);
  }
  if (assigneeResult.error) {
    throw new Error(
      `Failed to load task assignees: ${assigneeResult.error.message}`,
    );
  }
  if (logResult.error) {
    throw new Error(`Failed to load logs: ${logResult.error.message}`);
  }
  if (attendanceResult.error) {
    throw new Error(
      `Failed to load attendance: ${attendanceResult.error.message}`,
    );
  }

  const assigneesByTask = new Map<string, string[]>();
  for (const row of assigneeResult.data) {
    const existing = assigneesByTask.get(row.task_id) ?? [];
    if (row.is_primary) {
      existing.unshift(row.user_id);
    } else {
      existing.push(row.user_id);
    }
    assigneesByTask.set(row.task_id, existing);
  }

  const tasks = mapTasks(taskResult.data).map((task) =>
    withTaskParticipants(task, {
      assigneeIds: assigneesByTask.get(task.id),
      reviewerIds: task.reviewerIds,
    }),
  );

  return {
    members: memberResult.data.map(mapUser),
    tasks,
    logs: mapDailyTaskLogs(logResult.data),
    attendanceRecords: mapAttendanceRecords(attendanceResult.data),
    period,
  };
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
