import { LiveReport } from '@/modules/reports/components/live-report';
import { ArchivedReport } from '@/modules/reports/components/archived-report';
import { monthHistory, monthRevision } from '@/modules/reports';
import { liveViewContext } from '@/modules/reports';
import { displayPerformance } from '@/shared/math/exact';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { FileTextIcon, HistoryIcon, ListChecksIcon, StarIcon, type LucideIcon } from 'lucide-react';

import {
  EmptyState,
  MissionNotice,
  MissionPage,
  MissionPanel,
} from '@/shared/ui/mission-ui';
import { requireProfile } from '@/shared/session/profile';
import { getEmployeeItemHours } from '@/modules/checklists';
import type { ItemHourTask } from '@/modules/checklists/client';
import { canViewEmployeeReports } from '@/modules/team/client';
import { getEmployeeByEmployeeId, getEmployeeReportsData } from '@/modules/team';
import { normalizeEmployeeIdParam, resolveEmployeeRouteState } from '@/modules/team';
import { formatDate, formatNumeric, formatHours } from '@/shared/tracker/format';
import { carriedQuery, ProfileHeader } from '../profile-header';

interface EmployeeReportsPageProps {
  params: Promise<{ employeeId: string }>;
  searchParams:Promise<{period?:string;asOf?:string;revision?:string}>;
}

export async function generateMetadata({
  params,searchParams,
}: EmployeeReportsPageProps): Promise<Metadata> {
  const { employeeId } = await params;
  const normalized = normalizeEmployeeIdParam(employeeId);
  return { title: `${normalized ?? 'Employee'} Reports · TaskPulse` };
}

export default async function EmployeeReportsPage({
  params,searchParams,
}: EmployeeReportsPageProps) {
  const viewer = await requireProfile();
  const query=await searchParams;
  const context=await liveViewContext(query.period,query.asOf);
  const { employeeId } = await params;
  if(query.revision){
    const normalized=normalizeEmployeeIdParam(employeeId),revision=Number(query.revision);
    if(!normalized||!Number.isSafeInteger(revision)||revision<1)notFound();
    const employee=await getEmployeeByEmployeeId(normalized);
    if(!employee||!canViewEmployeeReports(viewer,employee))notFound();
    const archive=await monthRevision(context.period.startDate,revision,employee.id);
    if(!archive)notFound();
    const previous=revision>1?await monthRevision(context.period.startDate,revision-1,employee.id):null;
    return <MissionPage><ProfileHeader employee={employee} current="reports" description={`${context.period.label} · archived revision ${revision}`} query={carriedQuery(query)}/><ArchivedReport archive={archive} previous={previous} employee={employee.id}/><Link className="link justify-self-start" href={`/team/${encodeURIComponent(employee.employeeId)}/reports?period=${context.period.startDate.slice(0,7)}`}>View live employee report</Link></MissionPage>;
  }
  const routeState = await resolveEmployeeRouteState(
    employeeId,
    id=>getEmployeeReportsData(id,context.period,new Date(context.asOf)),
  );

  if (routeState.status !== 'ready') notFound();

  const data = routeState.data;
  if (!canViewEmployeeReports(viewer, data.employee)) notFound();
  const itemTo = context.asOfLocalDate < context.period.endDate ? context.asOfLocalDate : context.period.endDate;
  const [archiveHistory, itemHours] = await Promise.all([
    monthHistory(context.period.startDate),
    getEmployeeItemHours(data.employee.id, context.period.startDate, itemTo),
  ]);

  return (
    <MissionPage>
      <ProfileHeader
        employee={data.employee}
        current="reports"
        description={`${data.employee.employeeId} · ${data.period.label} · live report, revisions, stars and saved reports`}
        query={carriedQuery(query)}
        missionCount={data.presentation.tasks.length}
      />

      <div className="grid gap-5 lg:gap-6">
        {archiveHistory.revisions.length?<nav aria-label="Employee report revisions" className="flex flex-wrap gap-2">{archiveHistory.revisions.map(r=><Link className="section-tab bg-card" key={r.number} href={`/team/${encodeURIComponent(data.employee.employeeId)}/reports?period=${context.period.startDate.slice(0,7)}&revision=${r.number}`}>Revision {r.number} · {r.certification==='certified'?'Certified':'Incomplete'}</Link>)}</nav>:null}
        <LiveReport model={data.presentation}/>
        <ItemHoursPanel tasks={itemHours} />
        <h2 className="panel-title mt-2">Retained reports · original rules</h2>
        {data.performanceUnavailableReason ? <MissionNotice tone="attention" role="status">{data.performanceUnavailableReason} Saved reports and effort history remain available.</MissionNotice> : null}
        <section id="charts" aria-label="Chart summary">
          <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <ChartCard
            label="Performance score"
            value={
              data.performance
                ? displayPerformance(data.performance.calculation?.compositeExact??null,2)
                : '—'
            }
            detail="Current period composite score"
          />
          <ChartCard
            label="Productivity"
            value={
              data.performance?.productivity === null ||
              data.performance?.productivity === undefined
                ? '—'
                : `${displayPerformance(data.performance.calculation?.factors.productivity.rawExact??null)}/h`
            }
            detail="Scaled progress per regular attendance hour"
          />
          <ChartCard
            label="Attendance"
            value={`${formatHours(data.attendanceSummary.attendanceHours)}h`}
            detail={`${formatNumeric(data.attendanceSummary.payableDays)} payable days`}
          />
          <ChartCard
            label="Legacy daily stars · uncertified"
            value={String(data.awards.monthly.counts[data.employee.id]??0)}
            detail="Recorded daily star wins"
          />
          </dl>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <Panel title="Score parts saved by the earlier tracker" icon={HistoryIcon}>
            {data.scoreComponents.length === 0 ? (
              <EmptyState>No score component rows yet.</EmptyState>
            ) : (
              <div className="border-border overflow-x-auto rounded-xl border">
                <table className="sheet-grid min-w-[36rem]">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Metric</th>
                      <th className="text-right">Value</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.scoreComponents.map((component) => (
                      <tr key={component.id}>
                        <td className="text-xs">
                          {formatDate(component.scoreDate)}
                        </td>
                        <td className="text-xs">{component.metricKey}</td>
                        <td className="sheet-numeric text-xs">
                          {formatNumeric(component.metricValue)}
                        </td>
                        <td className="text-xs">
                          {component.sourceTable ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Daily star log" icon={StarIcon}>
            {data.stars.length === 0 ? (
              <EmptyState>No daily star records yet.</EmptyState>
            ) : (
              <div className="grid gap-2">
                {data.stars.map((star) => (
                  <div
                    key={star.id}
                    className="bg-recognition-subtle rounded-xl px-3.5 py-2.5 text-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-foreground font-medium">{formatDate(star.starDate)}</span>
                      <span className="text-recognition-foreground font-semibold tabular-nums">
                        {formatNumeric(star.score)}
                      </span>
                    </div>
                    {star.reason ? (
                      <p className="text-muted-foreground mt-1 text-xs">
                        {star.reason}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </section>

        <Panel title="Saved reports" icon={FileTextIcon}>
          {data.reports.length === 0 ? (
            <EmptyState>
              No saved report snapshots exist for this employee yet.
            </EmptyState>
          ) : (
            <div className="border-border overflow-x-auto rounded-xl border">
              <table className="sheet-grid min-w-[52rem]">
                <thead>
                  <tr>
                    <th>Report</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Period</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.reports.map((report) => (
                    <tr key={report.id}>
                      <td className="text-foreground text-xs font-semibold">
                        {report.title}
                      </td>
                      <td className="text-xs">{report.reportType}</td>
                      <td className="text-xs">{report.status}</td>
                      <td className="text-xs">
                        {formatDate(report.periodStart)} –{' '}
                        {formatDate(report.periodEnd)}
                      </td>
                      <td className="text-xs">{formatDate(report.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </MissionPage>
  );
}

function ChartCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="metric-card">
      <dt className="text-muted-foreground text-[11px] font-medium">{label}</dt>
      <dd className="stat-figure">{value}</dd>
      <dd className="metric-trend">{detail}</dd>
    </div>
  );
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <MissionPanel title={title} icon={icon}>
      {children}
    </MissionPanel>
  );
}


/**
 * Hours by checklist item (sheet-parity gap 5): this employee's item-timer
 * logs for the period up to the as-of date. They are part of task hours, not
 * extra hours.
 */
function ItemHoursPanel({ tasks }: { tasks: readonly ItemHourTask[] | null }) {
  return (
    <Panel title="Hours by checklist item" icon={ListChecksIcon}>
      {tasks === null ? (
        <EmptyState>Checklist item hours appear once this workspace gets its next database update.</EmptyState>
      ) : tasks.length === 0 ? (
        <EmptyState>No item-timer hours this period. Time logged with a checklist item's timer appears here.</EmptyState>
      ) : (
        <div className="grid gap-3">
          <p className="text-muted-foreground text-xs">Part of the task hours above, broken down by the checklist item that was timed.</p>
          {tasks.map(task => (
            <div key={task.taskId} className="border-border rounded-xl border">
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-3.5 py-2.5">
                <Link href={`/tasks/${encodeURIComponent(task.taskTag)}`} className="text-primary min-w-0 font-semibold hover:underline">
                  {task.taskTag}{task.taskTitle ? ` · ${task.taskTitle}` : ''}
                </Link>
                <span className="text-foreground text-sm font-semibold tabular-nums">{formatHours(task.hours)} h</span>
              </div>
              <ul className="border-border divide-border divide-y border-t text-sm">
                {task.items.map(item => (
                  <li key={item.nodeId} className="flex flex-wrap items-baseline justify-between gap-2 px-3.5 py-2">
                    <Link href={`/tasks/${encodeURIComponent(task.taskTag)}/checklist/${item.nodeId}`} className="text-foreground min-w-0 break-words hover:underline">
                      {item.title}
                    </Link>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {formatHours(item.hours)} h · {item.entries} log{item.entries === 1 ? '' : 's'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
