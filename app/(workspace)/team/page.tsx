import { ReportContext } from '@/modules/reports/components/view-context';
import { viewQuery } from '@/modules/reports/client';
import { liveViewContext } from '@/modules/reports';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AwardControls } from '@/components/team/award-controls';
import { AwardStatus } from '@/modules/scoring/components/award-status';
import { InitialsAvatar, MissionEmpty, MissionPage, MissionPageHeader } from '@/components/missions/mission-ui';
import { RoleBadge } from '@/components/tracker/tracker-badges';
import { getTeamHolidayDates } from '@/modules/attendance';
import { requireProfile } from '@/shared/session/profile';
import { canViewTeamModule } from '@/lib/team/permissions';
import { getTeamIndexData } from '@/lib/team/queries';
import { employeeHref, employeeReportsHref } from '@/lib/team/routes';
import { formatNumeric, formatHours } from '@/shared/tracker/format';

export const metadata: Metadata = {
  title: 'Team · TaskPulse',
};

export default async function TeamPage({searchParams}:{searchParams:Promise<{period?:string;asOf?:string}>}) {
  const profile = await requireProfile();

  if (!canViewTeamModule(profile)) {
    return (
      <MissionPage>
        <EmptyShell
          title="Team unavailable"
          description="Your account must be active to view the team index."
        />
      </MissionPage>
    );
  }

  const query=await searchParams;const context=await liveViewContext(query.period,query.asOf);
  const [data, holidays] = await Promise.all([
    getTeamIndexData(context.period,context),
    getTeamHolidayDates(context.period.startDate, context.period.endDate),
  ]);
  const canManage = profile.isActive && profile.role === 'managing_director';

  return (
    <MissionPage>
      <MissionPageHeader
        eyebrow="Team"
        title="Team index"
        chip={`${data.members.length} ${data.members.length === 1 ? 'member' : 'members'}`}
        description={`${data.period.label} · profiles, reports, charts, and star records`}
      />

      <ReportContext model={data.presentation}/>
      <h2 className="eyebrow text-muted-foreground -mb-2">Current support index · retained records, separate from as-of scoring</h2>
      <SupportSummaryCards summary={data.supportSummary} />

      <AwardStatus awards={data.awards} holidays={holidays} names={Object.fromEntries(data.members.map(m=>[m.user.id,m.user.fullName]))}/>
      {canManage ? <AwardControls awards={data.awards} members={data.members.map(m=>({id:m.user.id,fullName:m.user.fullName}))} /> : null}

      {data.members.length === 0 ? (
        <EmptyShell
          title="No active employees"
          description="Active employees will appear here once profiles are provisioned."
        />
      ) : (
        <section className="soft-card-clip" aria-label="Team members">
          <div className="overflow-x-auto">
            <table className="sheet-grid min-w-[70rem]">
              <thead>
                <tr>
                  <th>Team member</th>
                  <th>Profile</th>
                  <th>Reports</th>
                  <th>Charts</th>
                  <th className="text-right">Certified daily wins</th>
                  <th className="text-right">Current perf score</th>
                  <th>Report validity</th>
                  <th className="text-right">Attendance h</th>
                  <th className="text-right">Task h</th>
                </tr>
              </thead>
              <tbody>
                {data.members.map(({ user, performance, dailyStarCount, currentPerformanceScore, reportCount, performanceUnavailableReason }) => (
                  <tr key={user.id}>
                    <td className="text-xs">
                      <div className="flex items-start gap-2.5">
                        <InitialsAvatar name={user.fullName} tone={0} className="mt-0.5" />
                        <div className="flex min-w-0 flex-col gap-1">
                          <span className="text-foreground text-sm font-semibold">
                            {user.fullName}
                          </span>
                          <span className="text-muted-foreground font-mono">
                            {user.employeeId}
                          </span>
                          <RoleBadge role={user.role} />
                        </div>
                      </div>
                    </td>
                    <td className="text-xs">
                      <Link className="text-primary font-medium hover:underline" href={employeeHref(user)+'?'+viewQuery(context)}>
                        Open profile
                      </Link>
                    </td>
                    <td className="text-xs">
                      <Link className="text-primary font-medium hover:underline" href={employeeReportsHref(user)+'?'+viewQuery(context)}>
                        {reportCount} report{reportCount === 1 ? '' : 's'}
                      </Link>
                    </td>
                    <td className="text-xs">
                      <Link className="text-primary font-medium hover:underline" href={`/team/${encodeURIComponent(user.employeeId)}/reports?${viewQuery(context)}#charts`}>
                        Charts
                      </Link>
                    </td>
                    <td className="sheet-numeric text-xs">{dailyStarCount}</td>
                    <td className="sheet-numeric text-xs">
                      {currentPerformanceScore === null
                        ? '—'
                        : formatNumeric(currentPerformanceScore)}
                    </td>
                    <td className="text-xs">
                      {/* The sheet's "Reports validity": is this member's live report for the month complete? */}
                      {performance?.calculation?.status === 'complete' ? (
                        <span className="badge-soft badge-status-done">Valid</span>
                      ) : (
                        <span title={performanceUnavailableReason ?? 'Required performance inputs are unavailable.'} className="badge-soft badge-neutral">
                          Incomplete
                        </span>
                      )}
                    </td>
                    <td className="sheet-numeric text-xs">
                      {data.presentation.sources.attendance.find(a=>a.userId===user.id)?.available?formatHours(performance?.attendance.attendanceHours??0):'Unavailable'}
                    </td>
                    <td className="sheet-numeric text-xs">
                      {data.presentation.scope==='manager_team_detail'||user.id===profile.id?formatHours(performance?.hoursLogged??0):'Detail scope unavailable'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </MissionPage>
  );
}

function SupportSummaryCards({
  summary,
}: {
  summary: Awaited<ReturnType<typeof getTeamIndexData>>['supportSummary'];
}) {
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      <SupportCard
        href="/reports"
        label="Reports"
        value={summary.reports.total}
        detail={`${summary.reports.final} final · ${summary.reports.employeeReports} employee`}
      />
      <SupportCard
        href="/daily-facts"
        label="Daily facts"
        value={summary.facts.total}
        detail={`${summary.facts.validated} validated`}
      />
      <SupportCard
        href="/ideas"
        label="Ideas"
        value={summary.ideas.total}
        detail={`${summary.ideas.validated} validated`}
      />
      <SupportCard
        href="/suggestions"
        label="Suggestions"
        value={summary.suggestions.total}
        detail={`${summary.suggestions.validated} validated`}
      />
      <SupportCard
        href="/sales"
        label="Sales log"
        value={summary.sales.total}
        detail={`${summary.sales.newProjects} new projects`}
      />
    </section>
  );
}

function SupportCard({
  href,
  label,
  value,
  detail,
}: {
  href: string;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <Link href={href} className="metric-card hover:border-primary/40 transition-colors">
      <dt className="text-muted-foreground text-[11px] font-medium">{label}</dt>
      <dd className="stat-figure">{value}</dd>
      <dd className="metric-trend">{detail}</dd>
    </Link>
  );
}

function EmptyShell({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="soft-card p-6 text-center">
      <h2 className="text-foreground text-base font-bold">{title}</h2>
      <MissionEmpty className="mt-3">{description}</MissionEmpty>
    </section>
  );
}
