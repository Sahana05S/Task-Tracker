import { currentPeriod } from '@/shared/time/period';
import { countOpenMilestones } from '@/modules/milestones';
import { countOpenTasks } from '@/modules/tasks';
import { countMyLogsInPeriod } from '@/modules/time-tracking';

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
 * Each owning module counts with `head: true` and an exact count, so PostgREST
 * returns the tally in the `Content-Range` header and no rows cross the wire. That keeps this
 * cheap enough to run on every workspace navigation.
 *
 * Failures degrade to zero rather than throwing: a badge is decoration, and it
 * should never be the reason a page fails to render. That also means this keeps
 * working before `04_milestones_and_vision.sql` is applied — the milestone badge
 * simply reads zero until the table exists.
 */
export async function getNavCounts(userId: string): Promise<NavCounts> {
  const [openTasks, myLogsThisMonth, openMilestones] = await Promise.all([
    countOpenTasks(),
    countMyLogsInPeriod(userId, currentPeriod()),
    countOpenMilestones(),
  ]);
  return { openTasks, myLogsThisMonth, openMilestones };
}
