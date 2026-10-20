import { buttonVariants } from '@/shared/ui/button';
import { getLivePresentation } from '@/modules/reports';
import { liveViewContext } from '@/modules/reports';
import type { Metadata } from 'next';
import { AwardSummary } from '@/modules/workspace-views/components/dashboard/award-summary';
import { CalculationDetails } from '@/modules/workspace-views/components/dashboard/calculation-details';
import { DataStatusBanner } from '@/modules/workspace-views/components/dashboard/data-status-banner';
import { canManageAttendance } from '@/modules/attendance';
import { calculationReasons, dataGaps } from '@/modules/reports/client';

import { AllocationChart } from '@/modules/workspace-views/components/dashboard/allocation-chart';
import { ProductivityChart } from '@/modules/workspace-views/components/dashboard/productivity-chart';
import { StarPerformerCard } from '@/modules/workspace-views/components/dashboard/star-performer-card';
import { TeamStatsGrid } from '@/modules/workspace-views/components/dashboard/team-stats-grid';
import { TrackerSchemaNotice } from '@/modules/workspace-views/components/dashboard/tracker-schema-notice';
import { WorkbookDashboard } from '@/modules/workspace-views/components/dashboard/workbook-dashboard';
import { MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';
import { currentPeriod } from '@/shared/time/period';
import { getStoredSnapshots, getWorkbookDashboard } from '@/modules/reports';
import { requireProfile } from '@/shared/session/profile';
import { isMissingSchemaError } from '@/shared/supabase/schema-errors';

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
export default async function DashboardPage({searchParams}:{searchParams:Promise<{period?:string;asOf?:string}>}) {
  const profile = await requireProfile();
  const query=await searchParams;
  const context=await liveViewContext(query.period,query.asOf);
  const period=context.period;
  const presentation=await getLivePresentation(context);

  const [dashboardResult, snapshotsResult] = await Promise.allSettled([
    getWorkbookDashboard(period,context),
    getStoredSnapshots(period),
  ]);

  if (dashboardResult.status === 'rejected') {
    if (isMissingSchemaError(dashboardResult.reason)) {
      return (
        <MissionPage wide>
          <MissionPageHeader
            eyebrow="Team · Analytics"
            title="Team performance"
            description={`${period.label} · setup required`}
          />
          <TrackerSchemaNotice />
        </MissionPage>
      );
    }
    throw dashboardResult.reason;
  }

  if (snapshotsResult.status === 'rejected') {
    if (isMissingSchemaError(snapshotsResult.reason)) {
      return (
        <MissionPage wide>
          <MissionPageHeader
            eyebrow="Team · Analytics"
            title="Team performance"
            description={`${period.label} · setup required`}
          />
          <TrackerSchemaNotice />
        </MissionPage>
      );
    }
    throw snapshotsResult.reason;
  }

  const dashboard = dashboardResult.value;
  const snapshots = snapshotsResult.value;
  const { analytics, charts } = dashboard;
  const awards=presentation.awards;
  const names=Object.fromEntries(analytics.members.map(member=>[member.userId,member.fullName]));
  const activeMembers=presentation.sources.members.filter(member=>member.active);
  const attendanceMissing={
    missing:activeMembers.filter(member=>presentation.sources.attendance.find(a=>a.userId===member.id)?.available!==true).length,
    total:activeMembers.length,
  };
  const incomplete=analytics.calculation?.status!=='complete'||Boolean(awards&&awards.monthly.status==='incomplete');
  const gaps=dataGaps([...calculationReasons(analytics.calculation),...(awards?.monthly.reasons??[])]);
  if(attendanceMissing.missing>0&&!gaps.includes('attendance'))gaps.unshift('attendance');

  return (
    <MissionPage wide>
      <MissionPageHeader
        eyebrow="Team · Analytics"
        title="Team performance"
        chip={`${analytics.totals.activeMemberCount} active ${
          analytics.totals.activeMemberCount === 1 ? 'member' : 'members'
        }`}
        description={`${analytics.period.label} · ${analytics.totals.activeMemberCount} active ${
          analytics.totals.activeMemberCount === 1 ? 'member' : 'members'
        } · compared against the team median`}
        actions={
          <form method="get" className="flex items-center gap-2">
            <label htmlFor="dashboard-month" className="sr-only">Month</label>
            <input id="dashboard-month" type="month" name="period" defaultValue={period.startDate.slice(0,7)}
              className="field h-10 w-40 bg-white" />
            <button type="submit" className={buttonVariants({ variant: 'outline' })}>View</button>
          </form>
        }
      />

      {incomplete ? (
        <DataStatusBanner
          periodLabel={analytics.period.label}
          gaps={gaps}
          attendanceMissing={attendanceMissing}
          canRecordAttendance={profile.isActive&&canManageAttendance(profile.role)}
          historyFrom={presentation.detailsAvailable?null:presentation.detailsAvailableFrom}
        />
      ) : null}

      <TeamStatsGrid analytics={analytics} attendanceComplete={attendanceMissing.missing===0} attendanceMissing={attendanceMissing} />

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

      {awards ? (
        <AwardSummary awards={awards} names={names} availabilityReason={presentation.awardAvailabilityReason} />
      ) : (
        <StarPerformerCard
          unavailableReason="Awards are not available for this view."
          performer={analytics.starPerformer}
          periodLabel={analytics.period.label}
          medianProductivity={analytics.medians.productivity}
        />
      )}

      <WorkbookDashboard charts={charts} />

      <CalculationDetails
        presentation={presentation}
        calculation={analytics.calculation}
        awards={awards}
        names={names}
        viewerId={profile.id}
        snapshotCount={snapshots.length}
      />
    </MissionPage>
  );
}
