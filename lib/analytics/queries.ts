import { getLivePresentation } from '@/lib/presentation/queries';
import { viewContext,type ViewContext } from '@/lib/presentation/context';
import { currentPeriod,type AnalyticsPeriod,type TeamAnalytics } from '@/lib/analytics/engine';
import {
  buildWorkbookDashboardCharts,
  type WorkbookDashboardCharts,
} from '@/lib/analytics/dashboard-charts';
import { createClient } from '@/lib/supabase/server';

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
  return (await getLivePresentation(viewContext(period.startDate.slice(0,7)))).analytics;
}

export interface WorkbookDashboardData {
  analytics: TeamAnalytics;
  charts: WorkbookDashboardCharts;
}

export async function getWorkbookDashboard(
  period: AnalyticsPeriod = currentPeriod(),
  context:ViewContext=viewContext(period.startDate.slice(0,7))
): Promise<WorkbookDashboardData> {
  const source = await getLivePresentation(context);
  const analytics = source.analytics;

  return {
    analytics,
    charts: buildWorkbookDashboardCharts({
      analytics,
      members: source.members,
      tasks: source.tasks,
      period,
      asOfDate: context.asOfLocalDate,
    }),
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
