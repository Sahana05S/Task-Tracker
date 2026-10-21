// PRIVATE. Server-side leaderboard read: the shared ten-factor calculation for
// one month (scoring's public `loadPerformance`), projected to ranks before it
// leaves the server so members never receive other members' factor details.
import { loadPerformance } from '@/modules/scoring';
import { canManageTasks } from '@/modules/tasks/client';
import { createClient } from '@/shared/supabase/server';
import { observationInstant } from '@/shared/time/observation-clock';
import { currentPeriod, resolvePeriod, type AnalyticsPeriod } from '@/shared/time/period';
import type { User } from '@/types/tracker';

import { buildLeaderboard, type LeaderboardModel } from './leaderboard-rules';

function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** `YYYY-MM` from the URL, or the current Asia/Kolkata month. Future months are refused. */
export function leaderboardPeriod(value: string | undefined, now = new Date()): AnalyticsPeriod {
  const current = currentPeriod(now);
  if (!value) return current;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new Error('Choose a valid month.');
  const period = resolvePeriod(Number(value.slice(0, 4)), Number(value.slice(5)));
  if (period.startDate > current.startDate) throw new Error('That month has not started yet.');
  return period;
}

/**
 * The month's leaderboard as `viewer` may see it. The current month is read as
 * of the database clock; a past month as of its last instant (Asia/Kolkata).
 * Throws when the shared sources are unavailable, so the page can say so.
 */
export async function getLeaderboard(
  viewer: Pick<User, 'id' | 'role' | 'isActive'>,
  period: AnalyticsPeriod,
): Promise<LeaderboardModel> {
  const db = await createClient();
  const isCurrent = period.startDate === currentPeriod().startDate;
  const asOf = isCurrent
    ? (await observationInstant(db)).instant.toISOString()
    : new Date(`${period.endDate}T23:59:59.999+05:30`).toISOString();
  const { calculation } = await loadPerformance(db, period.startDate, nextDay(period.endDate), asOf);
  // Same rule as a profile: the member themself or a manager (team depends on
  // recognition, so the rule is applied here rather than imported from team).
  const manager = viewer.isActive && canManageTasks(viewer.role);
  return buildLeaderboard(calculation, viewer.id, (userId) => manager || (viewer.isActive && userId === viewer.id));
}
