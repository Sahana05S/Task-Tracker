import type { Metadata } from 'next';
import { PerformanceBreakdown } from '@/components/team/performance-breakdown';

import { AllocationChart } from '@/components/dashboard/allocation-chart';
import { ProductivityChart } from '@/components/dashboard/productivity-chart';
import { SnapshotButton } from '@/components/dashboard/snapshot-button';
import { StarPerformerCard } from '@/components/dashboard/star-performer-card';
import { TeamStatsGrid } from '@/components/dashboard/team-stats-grid';
import { TrackerSchemaNotice } from '@/components/dashboard/tracker-schema-notice';
import { WorkbookDashboard } from '@/components/dashboard/workbook-dashboard';
import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { currentPeriod } from '@/lib/analytics/engine';
import { getStoredSnapshots, getWorkbookDashboard } from '@/lib/analytics/queries';
import { requireProfile } from '@/lib/auth/profile';
import { isMissingSchemaError } from '@/lib/supabase/schema-errors';

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
 * Only the chart widgets, the snapshot control and the header are Client
 * Components, which keeps Recharts out of the bundle for everything else.
 */
export default async function DashboardPage() {
  const profile = await requireProfile();
  const period = currentPeriod();

  const [dashboardResult, snapshotsResult] = await Promise.allSettled([
    getWorkbookDashboard(period),
    getStoredSnapshots(period),
  ]);

  if (dashboardResult.status === 'rejected') {
    if (isMissingSchemaError(dashboardResult.reason)) {
      return (
        <>
          <WorkspaceHeader
            title="Team performance"
            description={`${period.label} · setup required`}
          />
          <div className="px-4 py-4 lg:px-6">
            <TrackerSchemaNotice />
          </div>
        </>
      );
    }
    throw dashboardResult.reason;
  }

  if (snapshotsResult.status === 'rejected') {
    if (isMissingSchemaError(snapshotsResult.reason)) {
      return (
        <>
          <WorkspaceHeader
            title="Team performance"
            description={`${period.label} · setup required`}
          />
          <div className="px-4 py-4 lg:px-6">
            <TrackerSchemaNotice />
          </div>
        </>
      );
    }
    throw snapshotsResult.reason;
  }

  const dashboard = dashboardResult.value;
  const snapshots = snapshotsResult.value;
  const { analytics, charts } = dashboard;

  const isDirector = profile.role === 'managing_director';

  return (
    <>
      <WorkspaceHeader
        title="Team performance"
        description={`${analytics.period.label} · ${analytics.totals.activeMemberCount} active ${
          analytics.totals.activeMemberCount === 1 ? 'member' : 'members'
        } · compared against the team median`}
        actions={
          // Writing snapshots is a managing_director right, per the RLS policy.
          isDirector ? (
            <SnapshotButton
              year={period.year}
              month={period.month}
              periodLabel={period.label}
              storedCount={snapshots.length}
            />
          ) : null
        }
      />

      <div className="flex flex-col gap-4 px-4 py-4 lg:px-6">
        <StarPerformerCard
          unavailableReason={analytics.calculation?.status==='incomplete' ? 'Ten-factor performance is incomplete. Final ranking and awards are unavailable; individual raw inputs and reasons appear below.' : 'Award selection awaits M08.'}
          performer={analytics.starPerformer}
          periodLabel={analytics.period.label}
          medianProductivity={analytics.medians.productivity}
        />

        <TeamStatsGrid analytics={analytics} />
        {analytics.calculation?.members.map(result=><details key={result.userId}><summary className="cursor-pointer">{analytics.members.find(m=>m.userId===result.userId)?.fullName??'Employee'} - performance inputs</summary><PerformanceBreakdown result={result} context={analytics.calculation?.context}/></details>)}

        <div className="grid gap-4 xl:grid-cols-2">
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

        <WorkbookDashboard charts={charts} />
      </div>
    </>
  );
}
