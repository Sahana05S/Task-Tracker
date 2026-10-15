import { LiveReport } from '@/components/reports/live-report';
import { viewContext,viewQuery } from '@/lib/presentation/context';
import { displayPerformance } from '@/lib/performance/exact';
import type { Metadata } from 'next';
import { PerformanceBreakdown } from '@/components/team/performance-breakdown';
import { AwardHistory } from '@/components/team/award-history';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { EmployeeAnalyticsChartsPanel } from '@/components/team/employee-analytics-charts';
import {
  CategoryBadge,
  FreshnessIndicator,
  PriorityBadge,
  RoleBadge,
} from '@/components/tracker/tracker-badges';
import { requireProfile } from '@/lib/auth/profile';
import { canViewEmployeeProfile } from '@/lib/team/permissions';
import { getEmployeeProfileData } from '@/lib/team/queries';
import {
  normalizeEmployeeIdParam,
  resolveEmployeeRouteState,
} from '@/lib/team/routes';
import { formatDate, formatNumeric, formatPercent } from '@/lib/tracker/format';
import type { DailyStarRecord, DailyTaskLog, Task } from '@/types/tracker';

interface EmployeePageProps {
  params: Promise<{ employeeId: string }>;
  searchParams:Promise<{period?:string;asOf?:string}>;
}

export async function generateMetadata({
  params,
}: EmployeePageProps): Promise<Metadata> {
  const { employeeId } = await params;
  const normalized = normalizeEmployeeIdParam(employeeId);
  return { title: `${normalized ?? 'Employee'} · Team · TaskPulse` };
}

export default async function EmployeePage({ params,searchParams }: EmployeePageProps) {
  const viewer = await requireProfile();
  const query=await searchParams;
  const context=viewContext(query.period,query.asOf);
  const { employeeId } = await params;
  const routeState = await resolveEmployeeRouteState(
    employeeId,
    id=>getEmployeeProfileData(id,context.period,new Date(context.asOf)),
  );

  if (routeState.status !== 'ready') notFound();

  const data = routeState.data;
  if (!canViewEmployeeProfile(viewer, data.employee)) notFound();

  return (
    <>
      <WorkspaceHeader
        title={data.employee.fullName}
        description={`${data.employee.employeeId} · ${data.period.label}`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/team/${encodeURIComponent(data.employee.employeeId)}/reports?${viewQuery(context)}`}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors"
            >
              Reports & charts
            </Link>
            <Link
              href="/team"
              className="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors"
            >
              Team index
            </Link>
          </div>
        }
      />

      <div className="mx-4 mt-4"><LiveReport model={data.presentation}/></div>
      {data.performanceUnavailableReason ? <p role="status" className="mx-4 mt-4 text-sm text-amber-800">{data.performanceUnavailableReason} Saved reports and effort history remain available.</p> : null}
      {data.performance?.calculation?<div className="mx-4 mt-4"><PerformanceBreakdown result={data.performance.calculation} context={data.performance.calculationContext}/></div>:null}
      <div className="mx-4 mt-4"><AwardHistory awards={data.awards}/></div>

      <div className="grid gap-4 px-4 py-4 xl:grid-cols-[minmax(0,1fr)_24rem] lg:px-6">
        <main className="grid gap-4">
          <section className="soft-card grid gap-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <RoleBadge role={data.employee.role} />
              <span className="text-muted-foreground font-mono text-xs">
                {data.employee.email}
              </span>
            </div>
            <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric label="Effective daily wins" value={String(data.awards.monthly.counts[data.employee.id]??0)} />
              <Metric
                label="As-of performance score"
                value={
                  data.performance
                    ? displayPerformance(data.performance.calculation?.compositeExact??null,2)
                    : '—'
                }
              />
              <Metric
                label="Attendance hours"
                value={data.presentation.sources.attendance.find(a=>a.userId===data.employee.id)?.available?formatNumeric(data.attendanceSummary.attendanceHours):'Unavailable'}
                unit="h"
              />
              <Metric
                label="Task hours"
                value={formatNumeric(data.taskHourSummary.totalHours)}
                unit="h"
              />
              <Metric
                label="Payable days"
                value={data.presentation.sources.attendance.find(a=>a.userId===data.employee.id)?.available?formatNumeric(data.attendanceSummary.payableDays): 'Unavailable'}
              />
              <Metric
                label="Off-hours"
                value={data.presentation.sources.attendance.find(a=>a.userId===data.employee.id)?.available?formatNumeric(data.attendanceSummary.offHours): 'Unavailable'}
                unit="h"
              />
              <Metric
                label="Today task hours"
                value={formatNumeric(data.taskHourSummary.todayHours)}
                unit="h"
              />
              <Metric
                label="Yesterday task hours"
                value={formatNumeric(data.taskHourSummary.yesterdayHours)}
                unit="h"
              />
              <Metric
                label="As-of support posts"
                value={String(
                  data.presentation.contributions.filter(c=>['fact','idea','suggestion'].includes(c.kind)).length,
                )}
              />
              <Metric
                label="Validated support"
                value={String(data.presentation.contributions.filter(c=>['fact','idea','suggestion'].includes(c.kind)&&c.source.validation_state==='validated').length)}
              />
              <Metric
                label="Sales logs"
                value={String(data.presentation.contributions.filter(c=>c.kind==='sale').length)}
              />
              <Metric
                label="Employee reports"
                value={String(data.supportSummary.reports)}
              />
            </dl>
          </section>

          <Panel title="Employee task list">
            <TaskList tasks={data.tasks} />
          </Panel>

          <p className="text-sm text-muted-foreground">Dated charts use captured scale/shares and recorded as-of inputs. Missing history creates gaps; shared work does not duplicate team credit.</p>
        <EmployeeAnalyticsChartsPanel charts={data.charts} />

          <section className="grid gap-4 xl:grid-cols-2">
            <Panel title="Today's tasks">
              <TaskLogSummary logs={data.todayLogs} tasks={data.todayTasks} />
            </Panel>
            <Panel title="Yesterday's tasks">
              <TaskLogSummary
                logs={data.yesterdayLogs}
                tasks={data.yesterdayTasks}
              />
            </Panel>
          </section>

          <Panel title="Task logs compilation">
            <TaskLogCompilation logs={data.logs} tasks={data.tasks} />
          </Panel>
        </main>

        <aside className="grid h-fit gap-4">
          <Panel title="Legacy star records · uncertified">
            <DailyStarLog stars={data.stars} />
          </Panel>

          <Panel title="Quick links">
            <div className="grid gap-2 text-sm">
              <Link
                href="/tasks"
                className="text-primary font-medium hover:underline"
              >
                Tasks
              </Link>
              <Link
                href="/logs"
                className="text-primary font-medium hover:underline"
              >
                Task logs
              </Link>
              <Link
                href="/attendance"
                className="text-primary font-medium hover:underline"
              >
                Attendance
              </Link>
              <Link
                href={`/team/${encodeURIComponent(data.employee.employeeId)}/reports?${viewQuery(context)}`}
                className="text-primary font-medium hover:underline"
              >
                Reports & charts
              </Link>
              <Link
                href="/daily-facts"
                className="text-primary font-medium hover:underline"
              >
                Daily facts
              </Link>
              <Link
                href="/ideas"
                className="text-primary font-medium hover:underline"
              >
                Ideas
              </Link>
              <Link
                href="/suggestions"
                className="text-primary font-medium hover:underline"
              >
                Suggestions
              </Link>
              <Link
                href="/sales"
                className="text-primary font-medium hover:underline"
              >
                Sales log
              </Link>
            </div>
          </Panel>
        </aside>
      </div>
    </>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="soft-card p-4">
      <h2 className="text-foreground text-sm font-semibold">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Metric({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white/70 p-3">
      <dt className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {label}
      </dt>
      <dd className="mt-1 flex items-baseline gap-1">
        <span className="tabular text-sm font-medium text-slate-900">
          {value}
        </span>
        {unit ? (
          <span className="text-muted-foreground text-xs">{unit}</span>
        ) : null}
      </dd>
    </div>
  );
}

function TaskList({ tasks }: { tasks: readonly Task[] }) {
  if (tasks.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No tasks are assigned to this employee yet.
      </p>
    );
  }

  return (
    <div className="relative overflow-x-auto">
      <table className="sheet-grid min-w-[56rem]">
        <thead>
          <tr>
            <th>Task tag</th>
            <th>Task</th>
            <th>Type</th>
            <th>Status</th>
            <th className="text-right">Progress</th>
            <th>Priority</th>
            <th>Freshness</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id}>
              <td className="text-xs">
                <Link
                  href={`/tasks/${encodeURIComponent(task.taskTag)}`}
                  className="task-tag hover:underline"
                >
                  {task.taskTag}
                </Link>
              </td>
              <td className="max-w-80 text-xs">{task.title}</td>
              <td className="text-xs">
                <CategoryBadge category={task.category} />
              </td>
              <td className="text-xs">{task.status}</td>
              <td className="sheet-numeric text-xs">
                {formatPercent(task.progressPercentage)}
              </td>
              <td className="text-xs">
                <PriorityBadge priority={task.priority} />
              </td>
              <td className="text-xs">
                <FreshnessIndicator freshness={task.freshness} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TaskLogSummary({
  logs,
  tasks,
}: {
  logs: readonly DailyTaskLog[];
  tasks: readonly Task[];
}) {
  if (logs.length === 0) {
    return <p className="text-muted-foreground text-sm">No task logs.</p>;
  }

  const tasksById = new Map(tasks.map((task) => [task.id, task]));

  return (
    <div className="grid gap-2">
      {logs.map((log) => {
        const task = tasksById.get(log.taskId);
        return (
          <div
            key={log.id}
            className="rounded-md border border-slate-200 bg-white/70 px-3 py-2 text-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-slate-900">
                  {task?.taskTag ?? 'Unknown task'}
                </p>
                <p className="text-muted-foreground text-xs">
                  {log.updateNotes ?? 'No update notes'}
                </p>
              </div>
              <span className="tabular text-xs font-medium">
                {formatNumeric(log.hoursWorked)}h
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskLogCompilation({
  logs,
  tasks,
}: {
  logs: readonly DailyTaskLog[];
  tasks: readonly Task[];
}) {
  if (logs.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No task logs have been recorded this period.
      </p>
    );
  }

  const tasksById = new Map(tasks.map((task) => [task.id, task]));

  return (
    <div className="relative overflow-x-auto">
      <table className="sheet-grid min-w-[52rem]">
        <thead>
          <tr>
            <th>Date</th>
            <th>Task tag</th>
            <th>Update</th>
            <th className="text-right">Hours worked</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td className="text-xs whitespace-nowrap">
                {formatDate(log.logDate)}
              </td>
              <td className="text-xs">
                {tasksById.get(log.taskId)?.taskTag ?? 'Unknown'}
              </td>
              <td className="max-w-96 text-xs">{log.updateNotes ?? '—'}</td>
              <td className="sheet-numeric text-xs">
                {formatNumeric(log.hoursWorked)}
              </td>
              <td className="text-xs">{log.logSource}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DailyStarLog({ stars }: { stars: readonly DailyStarRecord[] }) {
  if (stars.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No daily stars have been recorded this period.
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      {stars.map((star) => (
        <div
          key={star.id}
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium text-slate-900">
              {formatDate(star.starDate)}
            </span>
            <span className="tabular font-semibold text-amber-800">
              {formatNumeric(star.score)}
            </span>
          </div>
          {star.reason ? (
            <p className="mt-1 text-xs text-slate-700">{star.reason}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
