import type { Metadata } from 'next';

import { AllocationChart } from '@/components/dashboard/allocation-chart';
import { ProductivityChart } from '@/components/dashboard/productivity-chart';
import { SnapshotButton } from '@/components/dashboard/snapshot-button';
import { StarPerformerCard } from '@/components/dashboard/star-performer-card';
import { TeamStatsGrid } from '@/components/dashboard/team-stats-grid';
import { currentPeriod } from '@/lib/analytics/engine';
import { getStoredSnapshots, getTeamAnalytics } from '@/lib/analytics/queries';
import { requireProfile } from '@/lib/auth/profile';

export const metadata: Metadata = {
  title: 'Dashboard · TaskPulse',
};

/**
 * Team performance dashboard.
 *
 * A Server Component. The analytics engine runs here, on data the RLS policies
 * already permit the caller to read, so no computed figure crosses the network
 * that the caller could not derive themselves.
 *
 * Only the two chart widgets and the snapshot control are Client Components,
 * which keeps Recharts out of the bundle for everything else on the page.
 */
export default async function DashboardPage() {
  const profile = await requireProfile();
  const period = currentPeriod();

  const [analytics, snapshots] = await Promise.all([
    getTeamAnalytics(period),
    getStoredSnapshots(period),
  ]);

  const isDirector = profile.role === 'managing_director';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="text-base font-semibold text-slate-900">
            Team performance
          </h2>
          <p className="text-xs text-slate-500">
            {analytics.period.label} · {analytics.totals.activeMemberCount}{' '}
            active{' '}
            {analytics.totals.activeMemberCount === 1 ? 'member' : 'members'} ·
            all comparisons against the team median
          </p>
        </div>

        {/* Writing snapshots is a managing_director right, per the RLS policy. */}
        {isDirector ? (
          <SnapshotButton
            year={period.year}
            month={period.month}
            periodLabel={period.label}
            storedCount={snapshots.length}
          />
        ) : null}
      </div>

      <StarPerformerCard
        performer={analytics.starPerformer}
        periodLabel={analytics.period.label}
        medianProductivity={analytics.medians.productivity}
      />

      <TeamStatsGrid analytics={analytics} />

      <div className="grid gap-3 xl:grid-cols-2">
        <ProductivityChart
          members={analytics.members}
          medianProductivity={analytics.medians.productivity}
        />
        <AllocationChart
          members={analytics.members}
          medianAllocation={analytics.medians.allocationPercent}
          medianCriticality={analytics.medians.criticalityScore}
        />
      </div>
    </div>
  );
}
