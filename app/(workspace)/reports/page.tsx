import Link from 'next/link';
import { LiveReport } from '@/modules/reports/components/live-report';
import { getCompanySettings } from '@/modules/settings';
import { ArchivedReport } from '@/modules/reports/components/archived-report';
import { DailyReportView } from '@/modules/reports/components/daily-report';
import { MonthArchiveControls } from '@/modules/reports/components/month-archive-controls';
import { ReportSnapshotForm } from '@/modules/reports/components/report-snapshot-form';
import { monthHistory, monthRevision } from '@/modules/reports';
import { randomUUID } from 'node:crypto';
import { getLivePresentation } from '@/modules/reports';
import { liveViewContext, reportsTab } from '@/modules/reports';
import { kolkataDate } from '@/shared/time/kolkata';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { MissionNotice, MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';
import { PageTabs } from '@/shared/ui/page-nav';
import { ReportsModule } from '@/modules/support/components/support-pages';
import { requireProfile } from '@/shared/session/profile';
import { canManageReportSnapshots, getSupportModuleData } from '@/modules/support';
import { canManageTasks } from '@/modules/tasks/client';
import { canViewEmployeeReports, getEmployeeByEmployeeId } from '@/modules/team';
import { ISO_DATE_PATTERN } from '@/shared/forms/form-data';

export const metadata: Metadata = {
  title: 'Reports',
};

interface ReportsSearchParams {
  tab?: string;
  period?: string;
  asOf?: string;
  revision?: string;
  member?: string;
  date?: string;
  from?: string;
  to?: string;
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<ReportsSearchParams> }) {
  const query = await searchParams;
  const month = reportsTab(query) === 'month';
  const tabs = (
    <PageTabs
      label="Report views"
      tabs={[
        { href: '/reports', label: 'Daily report', current: !month },
        { href: `/reports?tab=month${query.period ? `&period=${encodeURIComponent(query.period)}` : ''}`, label: 'Month close', current: month },
      ]}
    />
  );
  return month ? <MonthClose query={query} tabs={tabs} /> : <DailyReport query={query} tabs={tabs} />;
}

/** The member's day: defaults to the viewer and today; managers may pick anyone. */
async function DailyReport({ query, tabs }: { query: ReportsSearchParams; tabs: React.ReactNode }) {
  const profile = await requireProfile();
  const live = await liveViewContext();
  const today = live.asOfLocalDate;
  const date = query.date && ISO_DATE_PATTERN.test(query.date) && query.date <= today ? query.date : today;
  // Members always get their own report; managers may pick anyone.
  const picked = query.member && query.member !== profile.employeeId && canManageTasks(profile.role) ? await getEmployeeByEmployeeId(query.member) : profile;
  if (!picked || !canViewEmployeeReports(profile, picked)) notFound();
  const employee = picked;
  // The day's month as currently recorded, so logs back-dated to that day still show.
  const context = date.slice(0, 7) === today.slice(0, 7) ? live : await liveViewContext(date.slice(0, 7));
  const model = await getLivePresentation(context, employee.id);
  const monthStart = context.period.startDate;
  const inRange = (value: string | undefined, fallback: string) => (value && ISO_DATE_PATTERN.test(value) && value >= monthStart && value <= date ? value : fallback);
  const from = inRange(query.from, monthStart);
  const to = inRange(query.to, date);

  return (
    <MissionPage>
      <MissionPageHeader
        title="Reports"
        description={`${employee.fullName} · daily report`}
        tabs={tabs}
      />
      <DailyReportView
        model={model}
        memberId={employee.id}
        date={date}
        from={from <= to ? from : to}
        to={to}
        maxDate={today}
        canPickMember={canManageTasks(profile.role)}
      />
    </MissionPage>
  );
}

/** Month close and its revisions, plus the saved reports. */
async function MonthClose({ query, tabs }: { query: ReportsSearchParams; tabs: React.ReactNode }) {
  const profile = await requireProfile();
  const context = await liveViewContext(query.period, query.asOf);
  const revision = query.revision ? Number(query.revision) : null;
  if (revision !== null && (!Number.isSafeInteger(revision) || revision < 1)) throw new Error('Invalid archive revision.');
  const history = await monthHistory(context.period.startDate);
  const archive = revision === null ? null : await monthRevision(context.period.startDate, revision);
  const previous = archive && revision && revision > 1 ? await monthRevision(context.period.startDate, revision - 1) : null;
  const presentation = revision === null ? await getLivePresentation(context) : null;
  const data = revision === null ? await getSupportModuleData(context.period, context.asOf) : null;

  return (
    <MissionPage>
      <MissionPageHeader
        title="Reports"
        description={data ? `${data.period.label} · ${data.summary.reports.total} reports · ${data.summary.reports.final} final` : `${context.period.label} · revision ${revision}`}
        tabs={tabs}
      />
      <MonthArchiveControls period={context.period.startDate} history={history} canClose={profile.role === 'managing_director'} completeMonth={context.period.endDate < kolkataDate(new Date())} operation={randomUUID()} />
      {archive ? <ArchivedReport archive={archive} previous={previous} employee={null} /> : revision !== null ? <MissionNotice tone="attention" role="status">That revision doesn&apos;t exist for {context.period.label}. <Link className="link" href={`/reports?period=${context.period.startDate.slice(0,7)}`}>Show the live month</Link>.</MissionNotice> : presentation ? <LiveReport model={presentation} companyName={(await getCompanySettings()).branding.companyName} /> : null}
      {data ? (
        <>
          {profile.role === 'managing_director' ? <ReportSnapshotForm period={context.period} members={data.members} /> : null}
          <h2 className="panel-title mt-2">Saved reports</h2><p className="text-muted-foreground -mt-3 text-sm">Each saved report keeps the figures and rules it was saved with.</p>
          <ReportsModule reports={data.reports} members={data.members} canManage={canManageReportSnapshots(profile.role)} />
        </>
      ) : null}
    </MissionPage>
  );
}
