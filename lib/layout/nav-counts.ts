import { currentPeriod } from '@/lib/analytics/engine';
import { createClient } from '@/shared/supabase/server';

/**
 * Counts shown as badges in the expanded navigation drawer.
 *
 * Only the figures that tell a member something actionable. Dashboard has no
 * badge: "how many dashboards" is not a quantity.
 */
export interface NavCounts {
  /** Tasks still in play across the team — not Done, not Discarded. */
  openTasks: number;
  /** The caller's own log entries for the current month. */
  myLogsThisMonth: number;
  /** Milestones not yet achieved. */
  openMilestones: number;
}

/**
 * Loads the drawer badge counts.
 *
 * Every query uses `head: true` with an exact count, so PostgREST returns the
 * tally in the `Content-Range` header and no rows cross the wire. That keeps this
 * cheap enough to run on every workspace navigation.
 *
 * Failures degrade to zero rather than throwing: a badge is decoration, and it
 * should never be the reason a page fails to render. That also means this keeps
 * working before `04_milestones_and_vision.sql` is applied — the milestone badge
 * simply reads zero until the table exists.
 */
export async function getNavCounts(userId: string): Promise<NavCounts> {
  const supabase = await createClient();
  const period = currentPeriod();

  const [taskResult, logResult, milestoneResult] = await Promise.all([
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .not('status', 'in', '("Done","Discarded")'),
    supabase
      .from('daily_task_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('log_date', period.startDate)
      .lte('log_date', period.endDate),
    supabase
      .from('company_milestones')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'Achieved'),
  ]);

  return {
    openTasks: taskResult.count ?? 0,
    myLogsThisMonth: logResult.count ?? 0,
    openMilestones: milestoneResult.count ?? 0,
  };
}
