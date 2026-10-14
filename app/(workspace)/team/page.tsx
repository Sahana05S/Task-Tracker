import { ReportContext } from '@/components/reports/view-context';
import { viewContext,viewQuery } from '@/lib/presentation/context';
import type { Metadata } from 'next';
import Link from 'next/link';

import { AwardControls } from '@/components/team/award-controls';
import { AwardStatus } from '@/components/team/award-status';
import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { Button } from '@/components/ui/button';
import { RoleBadge } from '@/components/tracker/tracker-badges';
import { requireProfile } from '@/lib/auth/profile';
import { canViewTeamModule } from '@/lib/team/permissions';
import { getTeamIndexData } from '@/lib/team/queries';
import { employeeHref, employeeReportsHref } from '@/lib/team/routes';
import { formatNumeric } from '@/lib/tracker/format';

export const metadata: Metadata = {
  title: 'Team · TaskPulse',
};

export default async function TeamPage({searchParams}:{searchParams:Promise<{period?:string;asOf?:string}>}) {
  const profile = await requireProfile();

  if (!canViewTeamModule(profile)) {
    return (
      <EmptyShell
        title="Team unavailable"
        description="Your account must be active to view the team index."
      />
    );
  }

  const query=await searchParams;const context=viewContext(query.period,query.asOf);
  const data = await getTeamIndexData(context.period,context);
  const canManage = profile.isActive && profile.role === 'managing_director';

  return (
    <>
      <WorkspaceHeader
        title="Team index"
        description={`${data.period.label} · profiles, reports, charts, and star records`}
      />

      <div className="grid gap-4 px-4 py-4 lg:px-6">
        <ReportContext model={data.presentation}/>
        <h2 className="text-sm">Current support index · retained records, separate from as-of scoring</h2>
        <SupportSummaryCards summary={data.supportSummary} />

        <AwardStatus awards={data.awards} names={Object.fromEntries(data.members.map(m=>[m.user.id,m.user.fullName]))}/>
        {canManage ? <AwardControls awards={data.awards} members={data.members.map(m=>({id:m.user.id,fullName:m.user.fullName}))} /> : null}

        {data.members.length === 0 ? (
          <EmptyShell
            title="No active employees"
            description="Active employees will appear here once profiles are provisioned."
          />
        ) : (
          <section className="soft-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="sheet-grid min-w-[64rem]">
                <thead>
                  <tr>
                    <th>Team member</th>
                    <th>Profile</th>
                    <th>Reports</th>
                    <th>Charts</th>
                    <th className="text-right">Certified daily wins</th>
                    <th className="text-right">Current perf score</th>
                    <th className="text-right">Attendance h</th>
                    <th className="text-right">Task h</th>
                  </tr>
                </thead>
                <tbody>
                  {data.members.map(({ user, performance, dailyStarCount, currentPerformanceScore, reportCount }) => (
                    <tr key={user.id}>
                      <td className="text-xs">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-slate-900">
                            {user.fullName}
                          </span>
                          <span className="text-muted-foreground font-mono">
                            {user.employeeId}
                          </span>
                          <RoleBadge role={user.role} />
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
                      <td className="sheet-numeric text-xs">
                        {data.presentation.sources.attendance.find(a=>a.userId===user.id)?.available?formatNumeric(performance?.attendance.attendanceHours??0):'Unavailable'}
                      </td>
                      <td className="sheet-numeric text-xs">
                        {data.presentation.scope==='manager_team_detail'||user.id===profile.id?formatNumeric(performance?.hoursLogged??0):'Detail scope unavailable'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </>
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
    <Link href={href} className="metric-card hover:border-primary/40">
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
    <section className="soft-card mx-4 my-4 p-6 text-center lg:mx-6">
      <h2 className="text-foreground text-sm font-semibold">{title}</h2>
      <p className="text-muted-foreground mt-1 text-sm">{description}</p>
    </section>
  );
}
