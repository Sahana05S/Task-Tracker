import { viewContext } from '@/modules/reports/client';
import { TaskList, TaskLogCompilation } from '@/modules/reports/components/member-panels';
import { displayPerformance } from '@/shared/math/exact';
import type { Metadata } from 'next';
import { PerformanceBreakdown } from '@/modules/scoring/components/performance-breakdown';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ClipboardListIcon, ListChecksIcon } from 'lucide-react';

import { MissionNotice, MissionPage, MissionPanel, StatTile } from '@/shared/ui/mission-ui';
import { EmployeeChartsPanel, ScoreVsMedianChart } from '@/modules/team/components/employee-analytics-charts';
import { StarCalendar } from '@/modules/team/components/star-calendar';
import { requireProfile } from '@/shared/session/profile';
import { canViewEmployeeProfile } from '@/modules/team/client';
import { getEmployeeProfileData, type EmployeeProfileData } from '@/modules/team';
import { getWaypointCount, type WaypointCount } from '@/modules/recognition';
import { normalizeEmployeeIdParam, resolveEmployeeRouteState } from '@/modules/team';
import { formatHours, formatNumeric } from '@/shared/tracker/format';
import { currentPeriod } from '@/shared/time/period';
import { UnavailableValue } from '@/shared/ui/unavailable-value';
import { carriedQuery, ProfileHeader, type ProfileTab } from './profile-header';

interface EmployeePageProps {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ period?: string; asOf?: string; tab?: string }>;
}

const TABS = new Set<ProfileTab>(['overview', 'charts', 'missions']);

export async function generateMetadata({ params }: EmployeePageProps): Promise<Metadata> {
  const { employeeId } = await params;
  const normalized = normalizeEmployeeIdParam(employeeId);
  return { title: `${normalized ?? 'Employee'} · Team · TaskPulse` };
}

export default async function EmployeePage({ params, searchParams }: EmployeePageProps) {
  const viewer = await requireProfile();
  const query = await searchParams;
  const context = viewContext(query.period, query.asOf);
  const tab: ProfileTab = TABS.has(query.tab as ProfileTab) ? (query.tab as ProfileTab) : 'overview';
  const { employeeId } = await params;
  const routeState = await resolveEmployeeRouteState(
    employeeId,
    id => getEmployeeProfileData(id, context.period, new Date(context.asOf)),
  );

  if (routeState.status !== 'ready') notFound();

  const data = routeState.data;
  if (!canViewEmployeeProfile(viewer, data.employee)) notFound();
  // Recognition only; the database refuses another member's count unless the viewer manages.
  const waypoints = tab === 'overview'
    ? await getWaypointCount(data.employee.id, data.period.startDate, data.period.endDate).catch(() => null)
    : null;

  return (
    <MissionPage>
      <ProfileHeader
        employee={data.employee}
        current={tab}
        description={`${data.employee.employeeId} · ${data.period.label}`}
        query={carriedQuery(query)}
        missionCount={data.tasks.length}
      />
      {tab === 'charts' ? (
        <>
          <MissionNotice>Dated charts use captured scale and shares and the inputs recorded at each date. Missing history leaves gaps; shared work does not duplicate team credit.</MissionNotice>
          <EmployeeChartsPanel charts={data.charts} />
        </>
      ) : tab === 'missions' ? (
        <Missions data={data} />
      ) : (
        <Overview data={data} waypoints={waypoints} />
      )}
    </MissionPage>
  );
}

function Overview({ data, waypoints }: { data: EmployeeProfileData; waypoints: WaypointCount | null }) {
  const attendance = data.presentation.sources.attendance.find(a => a.userId === data.employee.id)?.available ?? false;
  const support = data.presentation.contributions.filter(c => ['fact', 'idea', 'suggestion'].includes(c.kind));
  const score = data.performance ? displayPerformance(data.performance.calculation?.compositeExact ?? null, 2) : '—';
  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-6">
        <section className="soft-card p-5 sm:p-6" aria-label="Profile summary">
          <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
            <StatTile label="Performance score" value={score} note="As of the selected day" />
            <StatTile label="Effective daily wins" value={String(data.awards.monthly.counts[data.employee.id] ?? 0)} />
            <StatTile label="Task hours" value={formatHours(data.taskHourSummary.totalHours)} unit="h" />
            <Metric label="Attendance hours" value={attendance ? formatHours(data.attendanceSummary.attendanceHours) : null} unit="h" />
            <Metric label="Payable days" value={attendance ? formatNumeric(data.attendanceSummary.payableDays) : null} />
            <Metric label="Off-hours" value={attendance ? formatHours(data.attendanceSummary.offHours) : null} unit="h" />
            <StatTile label="Support posts" value={String(support.length)} note={`${support.filter(c => c.source.validation_state === 'validated').length} validated`} />
            <StatTile label="Sales logs" value={String(data.presentation.contributions.filter(c => c.kind === 'sale').length)} />
            <StatTile label="Employee reports" value={String(data.supportSummary.reports)} />
            {waypoints ? (
              <StatTile
                label={data.period.startDate === currentPeriod().startDate ? 'Waypoints this month' : 'Waypoints reached'}
                value={String(waypoints.total)}
                note={waypoints.byKey.landing ? `${waypoints.byKey.landing} landed` : undefined}
              />
            ) : null}
          </dl>
        </section>
        <StarCalendar days={data.charts.starDays} />
      </div>
      <ScoreVsMedianChart data={data.charts.performanceScoreTrend} />
      {data.performanceUnavailableReason ? <MissionNotice tone="attention" role="status">{data.performanceUnavailableReason} Saved reports and effort history remain available.</MissionNotice> : null}
      {data.performance?.calculation ? <PerformanceBreakdown result={data.performance.calculation} context={data.performance.calculationContext} /> : null}
    </>
  );
}

function Missions({ data }: { data: EmployeeProfileData }) {
  return (
    <>
      <MissionPanel icon={ListChecksIcon} title="Employee task list" subtitle="Missions this member is on or logged time against this month.">
        <TaskList tasks={data.tasks} />
      </MissionPanel>
      <MissionPanel
        icon={ClipboardListIcon}
        title="Task logs compilation"
        subtitle={`${data.period.label} · ${formatHours(data.taskHourSummary.totalHours)} h`}
        action={<Link href={`/reports?member=${encodeURIComponent(data.employee.employeeId)}`} className="link text-xs font-semibold">Daily report</Link>}
      >
        <TaskLogCompilation logs={data.logs} tasks={data.tasks} empty="No task logs have been recorded this period." />
      </MissionPanel>
    </>
  );
}

function Metric({ label, value, unit }: { label: string; /** Null when attendance is missing. */ value: string | null; unit?: string }) {
  return (
    <StatTile
      label={label}
      value={value ?? <UnavailableValue reason="attendance is not recorded for every day" />}
      unit={value === null ? undefined : unit}
    />
  );
}
