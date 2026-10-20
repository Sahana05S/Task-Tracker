import { buttonVariants } from '@/shared/ui/button';
import { LiveReport } from '@/modules/reports/components/live-report';
import { viewContext, viewQuery } from '@/modules/reports/client';
import { displayPerformance } from '@/shared/math/exact';
import type { Metadata } from 'next';
import { PerformanceBreakdown } from '@/modules/scoring/components/performance-breakdown';
import { AwardHistory } from '@/modules/scoring/components/award-history';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  ArrowLeftIcon,
  CalendarClockIcon,
  ClipboardListIcon,
  HistoryIcon,
  LinkIcon,
  ListChecksIcon,
  StarIcon,
  type LucideIcon,
} from 'lucide-react';

import {
  InitialsAvatar,
  EmptyState,
  MissionNotice,
  MissionPage,
  MissionPageHeader,
  MissionPanel,
  StatTile,
} from '@/shared/ui/mission-ui';
import { EmployeeAnalyticsChartsPanel } from '@/modules/team/components/employee-analytics-charts';
import {
  CategoryBadge,
  FreshnessIndicator,
  PriorityBadge,
  RoleBadge,
} from '@/shared/ui/tracker-badges';
import { requireProfile } from '@/shared/session/profile';
import { canViewEmployeeProfile } from '@/modules/team/client';
import { getEmployeeProfileData } from '@/modules/team';
import { normalizeEmployeeIdParam, resolveEmployeeRouteState } from '@/modules/team';
import { formatDate, formatNumeric, formatPercent, formatHours } from '@/shared/tracker/format';
import type { DailyStarRecord, DailyTaskLog, Task } from '@/types/tracker';
import { UnavailableValue } from '@/shared/ui/unavailable-value';

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
    <MissionPage>
      <nav aria-label="Breadcrumb" className="-mb-2 flex min-w-0 items-center gap-2 text-sm">
        <Link
          href="/team"
          aria-label="Back to team"
          className="text-muted-foreground hover:text-foreground hover:bg-muted flex size-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-(--shadow-card) transition-colors"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
        </Link>
        <span className="text-muted-foreground font-medium">Team</span>
        <span aria-hidden="true" className="text-muted-foreground">/</span>
        <span className="task-tag bg-primary-subtle text-primary-subtle-foreground rounded-md px-2 py-0.5">
          {data.employee.employeeId}
        </span>
      </nav>

      <MissionPageHeader
        title={data.employee.fullName}
        description={`${data.employee.employeeId} · ${data.period.label}`}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/team/${encodeURIComponent(data.employee.employeeId)}/reports?${viewQuery(context)}`}
              className={buttonVariants()}
            >
              Reports & charts
            </Link>
            <Link
              href="/team"
              className={buttonVariants({ variant: 'outline' })}
            >
              Team index
            </Link>
          </div>
        }
      />

      <section className="soft-card grid gap-4 p-5 sm:p-6" aria-label="Profile summary">
        <div className="flex flex-wrap items-center gap-3">
          <InitialsAvatar name={data.employee.fullName} className="size-11 text-sm" />
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <RoleBadge role={data.employee.role} />
            <span className="text-muted-foreground font-mono text-xs break-all">
              {data.employee.email}
            </span>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
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
            value={data.presentation.sources.attendance.find(a=>a.userId===data.employee.id)?.available?formatHours(data.attendanceSummary.attendanceHours):null}
            unit="h"
          />
          <Metric
            label="Task hours"
            value={formatHours(data.taskHourSummary.totalHours)}
            unit="h"
          />
          <Metric
            label="Payable days"
            value={data.presentation.sources.attendance.find(a=>a.userId===data.employee.id)?.available?formatNumeric(data.attendanceSummary.payableDays):null}
          />
          <Metric
            label="Off-hours"
            value={data.presentation.sources.attendance.find(a=>a.userId===data.employee.id)?.available?formatHours(data.attendanceSummary.offHours):null}
            unit="h"
          />
          <Metric
            label="Today task hours"
            value={formatHours(data.taskHourSummary.todayHours)}
            unit="h"
          />
          <Metric
            label="Yesterday task hours"
            value={formatHours(data.taskHourSummary.yesterdayHours)}
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

      <LiveReport model={data.presentation}/>
      {data.performanceUnavailableReason ? <MissionNotice tone="attention" role="status">{data.performanceUnavailableReason} Saved reports and effort history remain available.</MissionNotice> : null}
      {data.performance?.calculation?<PerformanceBreakdown result={data.performance.calculation} context={data.performance.calculationContext}/>:null}
      <AwardHistory awards={data.awards}/>

      <div className="grid gap-5 lg:gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <main className="grid min-w-0 content-start gap-5 lg:gap-6">
          <Panel title="Employee task list" icon={ListChecksIcon}>
            <TaskList tasks={data.tasks} />
          </Panel>

          <MissionNotice>Dated charts use captured scale/shares and recorded as-of inputs. Missing history creates gaps; shared work does not duplicate team credit.</MissionNotice>
          <EmployeeAnalyticsChartsPanel charts={data.charts} />

          <section className="grid gap-4 xl:grid-cols-2">
            <Panel title="Today's missions" icon={CalendarClockIcon}>
              <TaskLogSummary logs={data.todayLogs} tasks={data.todayTasks} />
            </Panel>
            <Panel title="Yesterday's missions" icon={HistoryIcon}>
              <TaskLogSummary
                logs={data.yesterdayLogs}
                tasks={data.yesterdayTasks}
              />
            </Panel>
          </section>

          <Panel title="Task logs compilation" icon={ClipboardListIcon}>
            <TaskLogCompilation logs={data.logs} tasks={data.tasks} />
          </Panel>
        </main>

        <aside className="grid h-fit gap-5 lg:gap-6">
          <Panel title="Legacy star records · uncertified" icon={StarIcon}>
            <DailyStarLog stars={data.stars} />
          </Panel>

          <Panel title="Quick links" icon={LinkIcon}>
            <div className="grid gap-2 text-sm">
              <Link
                href="/tasks"
                className="link"
              >
                Missions
              </Link>
              <Link
                href="/logs"
                className="link"
              >
                Task logs
              </Link>
              <Link
                href="/attendance"
                className="link"
              >
                Attendance
              </Link>
              <Link
                href={`/team/${encodeURIComponent(data.employee.employeeId)}/reports?${viewQuery(context)}`}
                className="link"
              >
                Reports & charts
              </Link>
              <Link
                href="/daily-facts"
                className="link"
              >
                Daily facts
              </Link>
              <Link
                href="/ideas"
                className="link"
              >
                Ideas
              </Link>
              <Link
                href="/suggestions"
                className="link"
              >
                Suggestions
              </Link>
              <Link
                href="/sales"
                className="link"
              >
                Sales log
              </Link>
            </div>
          </Panel>
        </aside>
      </div>
    </MissionPage>
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

function Metric({
  label,
  value,
  unit,
}: {
  label: string;
  /** Null when the figure cannot be worked out (for example, attendance missing). */
  value: string | null;
  unit?: string;
}) {
  return (
    <StatTile
      label={label}
      value={value ?? <UnavailableValue reason="attendance is not recorded for every day" />}
      unit={value === null || value === '—' ? undefined : unit}
    />
  );
}

function TaskList({ tasks }: { tasks: readonly Task[] }) {
  if (tasks.length === 0) {
    return (
      <EmptyState>No missions are assigned to this employee yet.</EmptyState>
    );
  }

  return (
    <div className="border-border relative -mx-1 overflow-x-auto rounded-xl border">
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
    return <EmptyState>No task logs.</EmptyState>;
  }

  const tasksById = new Map(tasks.map((task) => [task.id, task]));

  return (
    <div className="grid gap-2">
      {logs.map((log) => {
        const task = tasksById.get(log.taskId);
        return (
          <div
            key={log.id}
            className="bg-muted/70 rounded-xl px-3.5 py-2.5 text-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="task-tag">
                  {task?.taskTag ?? 'Unknown task'}
                </p>
                <p className="text-muted-foreground text-xs">
                  {log.updateNotes ?? 'No update notes'}
                </p>
              </div>
              <span className="text-success-strong text-xs font-semibold tabular-nums">
                {formatHours(log.hoursWorked)}h
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
      <EmptyState>No task logs have been recorded this period.</EmptyState>
    );
  }

  const tasksById = new Map(tasks.map((task) => [task.id, task]));

  return (
    <div className="border-border relative -mx-1 overflow-x-auto rounded-xl border">
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
                {formatHours(log.hoursWorked)}
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
      <EmptyState>No daily stars have been recorded this period.</EmptyState>
    );
  }

  return (
    <div className="grid gap-2">
      {stars.map((star) => (
        <div
          key={star.id}
          className="bg-recognition-subtle rounded-xl px-3.5 py-2.5 text-sm"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-foreground font-medium">
              {formatDate(star.starDate)}
            </span>
            <span className="text-recognition-foreground font-semibold tabular-nums">
              {formatNumeric(star.score)}
            </span>
          </div>
          {star.reason ? (
            <p className="text-muted-foreground mt-1 text-xs">{star.reason}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
