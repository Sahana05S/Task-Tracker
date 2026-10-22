import { getLivePresentation } from '@/modules/reports/internal/presentation/queries';
import { viewContext,type ViewContext } from '@/modules/reports/internal/presentation/context';
import { currentPeriod, type AnalyticsPeriod } from '@/shared/time/period';
import { getAwards } from '@/modules/scoring';
import { type TeamAnalytics } from '@/modules/scoring/client';
import { buildWorkbookDashboardCharts, type WorkbookDashboardCharts } from '@/modules/scoring/client';
import { dailyPerfRows, type DailyPerfFilter, type DailyPerfLog } from '@/modules/reports/internal/daily-perf-log';
import { getMemberDayHours } from '@/modules/time-tracking';
import { createClient } from '@/shared/supabase/server';

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

/**
 * The daily perf log for a filter built with `dailyPerfFilter`. Rows cover
 * active members plus anyone with a retained run in the range, or just the
 * filtered member. Throws when a source is unavailable, so the page shows it
 * as unavailable rather than as empty.
 */
export async function getDailyPerfLog(filter: DailyPerfFilter): Promise<DailyPerfLog> {
  const db = await createClient();
  const range: AnalyticsPeriod = {
    year: Number(filter.from.slice(0, 4)),
    month: Number(filter.from.slice(5, 7)),
    startDate: filter.from,
    endDate: filter.to,
    label: `${filter.from} to ${filter.to}`,
  };
  const [awards, users, hours] = await Promise.all([
    getAwards(db, range, undefined, filter.member ?? undefined),
    db.from('users').select('id, full_name, is_active'),
    getMemberDayHours(filter.from, filter.to, filter.member),
  ]);
  if (users.error) throw new Error(`Members unavailable: ${users.error.message}`);
  const ran = new Set(awards.days.flatMap((day) => day.candidates.map((candidate) => candidate.userId)));
  const options = users.data
    .filter((user) => user.is_active || ran.has(user.id) || user.id === filter.member)
    .map((user) => ({ id: user.id, fullName: user.full_name }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  const members = filter.member ? options.filter((option) => option.id === filter.member) : options;
  return { ...filter, members, options, rows: dailyPerfRows({ from: filter.from, to: filter.to, members, days: awards.days, hours }) };
}
