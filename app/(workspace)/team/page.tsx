import type { Metadata } from 'next';
import Link from 'next/link';

import {
  calculateDailyStarAction,
  overrideDailyStarAction,
} from '@/app/(workspace)/team/star-actions';
import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { Button } from '@/components/ui/button';
import { RoleBadge } from '@/components/tracker/tracker-badges';
import { requireProfile } from '@/lib/auth/profile';
import { canManageTasks } from '@/lib/tasks/permissions';
import { canViewTeamModule } from '@/lib/team/permissions';
import { getTeamIndexData } from '@/lib/team/queries';
import { employeeHref, employeeReportsHref } from '@/lib/team/routes';
import { formatNumeric } from '@/lib/tracker/format';

export const metadata: Metadata = {
  title: 'Team · TaskPulse',
};

export default async function TeamPage() {
  const profile = await requireProfile();

  if (!canViewTeamModule(profile)) {
    return (
      <EmptyShell
        title="Team unavailable"
        description="Your account must be active to view the team index."
      />
    );
  }

  const data = await getTeamIndexData();
  const canManage = canManageTasks(profile.role);

  return (
    <>
      <WorkspaceHeader
        title="Team index"
        description={`${data.period.label} · profiles, reports, charts, and star records`}
      />

      <div className="grid gap-4 px-4 py-4 lg:px-6">
        <SupportSummaryCards summary={data.supportSummary} />

        {canManage ? <DailyStarManager members={data.members} /> : null}

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
                    <th className="text-right">Daily stars</th>
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
                        <Link className="text-primary font-medium hover:underline" href={employeeHref(user)}>
                          Open profile
                        </Link>
                      </td>
                      <td className="text-xs">
                        <Link className="text-primary font-medium hover:underline" href={employeeReportsHref(user)}>
                          {reportCount} report{reportCount === 1 ? '' : 's'}
                        </Link>
                      </td>
                      <td className="text-xs">
                        <Link className="text-primary font-medium hover:underline" href={`/team/${encodeURIComponent(user.employeeId)}/reports#charts`}>
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
                        {formatNumeric(performance?.attendance.attendanceHours ?? 0)}
                      </td>
                      <td className="sheet-numeric text-xs">
                        {formatNumeric(performance?.hoursLogged ?? 0)}
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

function DailyStarManager({
  members,
}: {
  members: Awaited<ReturnType<typeof getTeamIndexData>>['members'];
}) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="soft-card grid gap-4 p-4 xl:grid-cols-2">
      <div>
        <h2 className="text-foreground text-sm font-semibold">
          Automatic daily star
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Calculates from task effort, scaled progress, productivity, checklist
          completion, freshness, and attendance validity.
        </p>
        <form
          action={asFormAction(calculateDailyStarAction)}
          className="mt-3 flex flex-wrap items-end gap-2"
        >
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-900">Date</span>
            <input
              type="date"
              name="starDate"
              defaultValue={today}
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            />
          </label>
          <Button type="submit" size="sm">
            Calculate star
          </Button>
        </form>
      </div>

      <div>
        <h2 className="text-foreground text-sm font-semibold">
          Manager override
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Use only when source data is incorrect, and describe the correction.
        </p>
        <form
          action={asFormAction(overrideDailyStarAction)}
          className="mt-3 grid gap-2"
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-900">Date</span>
              <input
                type="date"
                name="starDate"
                defaultValue={today}
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-medium text-slate-900">Correct star</span>
              <select
                name="overrideUserId"
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                required
              >
                <option value="">Select employee</option>
                {members.map(({ user }) => (
                  <option key={user.id} value={user.id}>
                    {user.fullName}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <textarea
            name="overrideReason"
            className="border-input bg-background min-h-20 rounded-md border px-3 py-2 text-sm"
            placeholder="Explain the incorrect data and correction."
            required
          />
          <Button type="submit" size="sm" variant="outline" className="w-fit">
            Override star
          </Button>
        </form>
      </div>
    </section>
  );
}

type ServerFormAction = (formData: FormData) => void | Promise<void>;

function asFormAction(
  action: (formData: FormData) => Promise<unknown>,
): ServerFormAction {
  return action as ServerFormAction;
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
