import { isTaskCarriedInPeriod, type AnalyticsPeriod, type MemberPerformance, type TeamAnalytics } from '@/lib/analytics/engine';
import type { Task } from '@/types/tracker';

/**
 * Missions headline strip (the sheet tracker's Tasks header), as approved by
 * the user on 16 October 2026 (DECISIONS, "Missions headline strip"):
 *
 * - Leaders reuse the dashboard's shared-engine figures: highest criticality
 *   score, highest productivity, largest loading difference above the median.
 *   Missing values make a leader unavailable; a tie names nobody.
 * - Allocation spread is the dashboard's `totals.allocationSpread`.
 * - Team averages run over the month's tracked tasks (carried in the period,
 *   not archived, not Discarded): mean progress %, and mean task productivity
 *   over tasks with logged hours.
 * - Colours: spread green up to 5, amber above 5 up to 7, red above 7 (lower is
 *   better); productivity red below 4, amber 4 to below 7, green 7 and up;
 *   progress red below 50, amber 50 to below 75, green 75 and up.
 */

export type Band = 'green' | 'amber' | 'red';

export interface HeadlineLeader {
  /** Null when unavailable or tied. */
  name: string | null;
  value: number | null;
  reason: 'available' | 'unavailable' | 'tie';
}

export interface MissionHeadline {
  critical: HeadlineLeader;
  productive: HeadlineLeader;
  loaded: HeadlineLeader;
  allocationSpread: { value: number | null; band: Band | null };
  averageProductivity: { value: number | null; band: Band | null; taskCount: number };
  averageProgress: { value: number | null; band: Band | null; taskCount: number };
}

export const spreadBand = (v: number): Band => (v <= 5 ? 'green' : v <= 7 ? 'amber' : 'red');
export const productivityBand = (v: number): Band => (v < 4 ? 'red' : v < 7 ? 'amber' : 'green');
export const progressBand = (v: number): Band => (v < 50 ? 'red' : v < 75 ? 'amber' : 'green');

export function leaderBy(members: readonly MemberPerformance[], pick: (m: MemberPerformance) => number | null): HeadlineLeader {
  const known = members.flatMap(m => {
    const value = pick(m);
    return value === null || !Number.isFinite(value) ? [] : [{ name: m.fullName, value }];
  });
  if (!known.length) return { name: null, value: null, reason: 'unavailable' };
  const top = Math.max(...known.map(k => k.value));
  const winners = known.filter(k => k.value === top);
  return winners.length === 1
    ? { name: winners[0].name, value: top, reason: 'available' }
    : { name: null, value: top, reason: 'tie' };
}

const mean = (values: readonly number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

export function computeMissionHeadline({
  analytics,
  tasks,
  period,
  hoursByTask,
}: {
  analytics: TeamAnalytics | null;
  tasks: readonly Task[];
  period: AnalyticsPeriod;
  hoursByTask: ReadonlyMap<string, number>;
}): MissionHeadline {
  const tracked = tasks.filter(t => !t.archivedEffectiveDate && t.status !== 'Discarded' && isTaskCarriedInPeriod(t, period));
  const progress = tracked.flatMap(t => (t.progressPercentage === null ? [] : [t.progressPercentage]));
  const productivity = tracked.flatMap(t =>
    (hoursByTask.get(t.id) ?? 0) > 0 && t.taskProductivity !== null && Number.isFinite(t.taskProductivity) ? [t.taskProductivity] : [],
  );
  const avgProgress = mean(progress);
  const avgProductivity = mean(productivity);
  const members = analytics?.members ?? [];
  const spread = analytics && Number.isFinite(analytics.totals.allocationSpread) ? analytics.totals.allocationSpread : null;
  return {
    critical: analytics ? leaderBy(members, m => m.criticalityScore) : { name: null, value: null, reason: 'unavailable' },
    productive: analytics ? leaderBy(members, m => m.productivity) : { name: null, value: null, reason: 'unavailable' },
    loaded: analytics ? leaderBy(members, m => m.loadingDiff) : { name: null, value: null, reason: 'unavailable' },
    allocationSpread: { value: spread, band: spread === null ? null : spreadBand(spread) },
    averageProductivity: { value: avgProductivity, band: avgProductivity === null ? null : productivityBand(avgProductivity), taskCount: productivity.length },
    averageProgress: { value: avgProgress, band: avgProgress === null ? null : progressBand(avgProgress), taskCount: progress.length },
  };
}
