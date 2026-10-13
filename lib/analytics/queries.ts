import { classifyFreshness, kolkataDate } from '@/lib/tasks/contract';
import { loadPerformance } from '@/lib/performance/queries';
import { parseTaskCredits } from '@/lib/tasks/credit-summary';
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
import { getTeamSummaryInputs } from '@/lib/analytics/summary-inputs';
import type { AnalyticsInput } from '@/lib/analytics/engine';
import { mapUser, USER_COLUMNS } from '@/lib/supabase/mappers';
import { createClient } from '@/lib/supabase/server';
import {
  mapTasks,
  TASK_COLUMNS,
  withTaskParticipants,
} from '@/lib/tasks/mappers';

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

type AnalyticsSource = AnalyticsInput;

async function getAnalyticsSource(
  period: AnalyticsPeriod,
): Promise<AnalyticsSource> {
  const supabase = await createClient();
  const today=kolkataDate();
  const asOfInstant=period.endDate<today?new Date(`${period.endDate}T23:59:59.999+05:30`).toISOString():new Date().toISOString();
  const exclusive=new Date(`${period.endDate}T00:00:00Z`);exclusive.setUTCDate(exclusive.getUTCDate()+1);
  const performance=await loadPerformance(supabase,period.startDate,exclusive.toISOString().slice(0,10),asOfInstant);

  const [memberResult, taskResult, assigneeResult, summary, creditResult] = await Promise.all([
    supabase.from('users').select(USER_COLUMNS).order('full_name'),
    supabase.from('tasks').select(TASK_COLUMNS),
    supabase.from('task_assignees').select('task_id, user_id, is_primary, share_units'),
    getTeamSummaryInputs(period),
    supabase.rpc('task_credit_summary'),
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

  if (creditResult.error) throw new Error(`Failed to load earned credit: ${creditResult.error.message}`);
  const credits=parseTaskCredits(creditResult.data);
  const localToday=kolkataDate();
  const asOf=period.endDate<localToday ? period.endDate : localToday;
  const tasks = mapTasks(taskResult.data).map(task=>{ const fresh=classifyFreshness(task,asOf); return {...task,freshness:fresh.state,freshnessReason:fresh.reason}; }).map((task) =>
    withTaskParticipants({ ...task, earnedProgressCredits: credits.get(task.id) ?? {}, participantShares: task.participantCreditMode === "configured" ? Object.fromEntries(assigneeResult.data.filter((row) => row.task_id === task.id).map((row) => [row.user_id, row.share_units ?? 0])) : null }, {
      assigneeIds: assigneesByTask.get(task.id),
      reviewerIds: task.reviewerIds,
    }),
  );

  return {
    calculation: performance.calculation,
    members: memberResult.data.map(mapUser).map(member=>{
      const observed=performance.sources.members.find(source=>source.id===member.id);
      return observed ? {...member,fullName:observed.fullName,employeeId:observed.employeeId,role:observed.role,isActive:observed.active} : {...member,isActive:false};
    }),
    tasks,
    logs: summary.logs,
    attendanceSummaries: summary.attendanceSummaries,
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
