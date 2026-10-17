import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArchiveIcon,
  ArrowLeftIcon,
  ClipboardCheckIcon,
  GitBranchIcon,
  HistoryIcon,
  ListChecksIcon,
  PencilIcon,
  TimerIcon,
} from 'lucide-react';

import { QuickLogTrigger } from '@/components/logs/quick-log-trigger';
import { MissionPanel } from '@/components/missions/mission-ui';
import {
  CategoryBadge,
  FreshnessIndicator,
  PriorityBadge,
  StatusBadge,
} from '@/components/tracker/tracker-badges';
import { getTaskEffortBreakdown } from '@/lib/checklists/item-time';
import { canStartTimerForTask } from '@/lib/timers/permissions';
import {
  canManageTasks,
  canUpdateTaskOwnFields,
  getNativeDetailState,
  getNativeTemplates,
  getTaskWorkspaceData,
  getVisibleReportChoices,
  normalizeTaskTagParam,
  resolveTaskDetailRouteState,
} from '@/modules/tasks';
import { ChecklistHero, PhaseProgress } from '@/modules/tasks/components/detail/checklist-summary';
import { DependencyList } from '@/modules/tasks/components/detail/dependency-list';
import { EffortPanel } from '@/modules/tasks/components/detail/effort-panel';
import { TaskLogTimeline } from '@/modules/tasks/components/detail/log-timeline';
import { MissionBrief } from '@/modules/tasks/components/detail/mission-brief';
import { MissionOverview } from '@/modules/tasks/components/detail/mission-overview';
import { WorkFilesPanel } from '@/modules/tasks/components/detail/work-files-panel';
import { TaskLifecyclePanel } from '@/modules/tasks/components/task-lifecycle-panel';
import { TaskReviewForm } from '@/modules/tasks/components/task-review-form';
import { requireProfile } from '@/shared/session/profile';
import { formatHours, isOverdue } from '@/shared/tracker/format';

import { ManualTimeForm, TimerControl, TimerRecords } from './timer-panels';

interface TaskDetailPageProps {
  params: Promise<{
    taskTag: string;
  }>;
}

export async function generateMetadata({
  params,
}: TaskDetailPageProps): Promise<Metadata> {
  const { taskTag } = await params;
  const normalizedTaskTag = normalizeTaskTagParam(taskTag);

  return {
    title: `${normalizedTaskTag ?? 'Mission'} · TaskPulse`,
  };
}

/**
 * Mission details (layout references: Stitch mission_details_1 for phones and
 * mission_details_2 for desktop). Every figure is the existing task data under
 * the caller's permissions; no star credits or other new rules are shown.
 *
 * This page only loads data and arranges the panels; each panel lives in
 * modules/tasks/components/detail (timer panels in ./timer-panels).
 */
export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
  const currentUser = await requireProfile();

  const { taskTag } = await params;
  const routeState = await resolveTaskDetailRouteState(taskTag);

  if (routeState.status !== 'ready') {
    notFound();
  }

  const { data } = routeState;
  const task = data.task;
  const archived = !!task.archivedEffectiveDate;
  const successor = data.dependencies.find((d) => d.otherTask?.id === task.handoffSuccessorId)?.otherTask;
  const canManage = canManageTasks(currentUser.role) && !archived;
  const [native, templates, workspace, reports, effortBreakdown] = await Promise.all([
    getNativeDetailState(task.id),
    getNativeTemplates(),
    canManage ? getTaskWorkspaceData() : Promise.resolve({ tasks: [], members: [] }),
    canManage ? getVisibleReportChoices() : Promise.resolve([]),
    getTaskEffortBreakdown(task.id),
  ]);
  const canUseTimer = !archived && canStartTimerForTask(currentUser, task);
  const visibleTimers = canManage
    ? data.timers
    : data.timers.filter((timer) => timer.userId === currentUser.id);
  const activeCurrentTimer =
    data.timers.find((timer) => timer.userId === currentUser.id && timer.status === 'Running') ?? null;

  const memberNames = new Map(data.members.map((member) => [member.id, member.fullName]));
  const assigneeNames = task.assigneeIds.map((id) => memberNames.get(id) ?? 'Unknown');
  const reviewerNames = task.reviewerIds.map((id) => memberNames.get(id) ?? 'Unknown');

  const checklistHref = `/tasks/${encodeURIComponent(task.taskTag)}/checklist`;
  const closed = task.status === 'Done' || task.status === 'Discarded';
  const overdue = isOverdue(task.dueDate) && !closed;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pt-5 pb-10 lg:px-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
        <Link
          href="/tasks"
          aria-label="Back to missions"
          className="text-muted-foreground hover:text-foreground hover:bg-muted flex size-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-(--shadow-card) transition-colors"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
        </Link>
        <Link href="/tasks" className="text-muted-foreground hover:text-foreground shrink-0 font-medium">
          Missions
        </Link>
        <span aria-hidden="true" className="text-muted-foreground">/</span>
        <span className="task-tag bg-primary-subtle text-primary-subtle-foreground shrink-0 rounded-md px-2 py-0.5">
          {task.taskTag}
        </span>
        <span aria-hidden="true" className="text-muted-foreground hidden sm:inline">/</span>
        <span className="text-foreground hidden truncate font-medium sm:inline" aria-current="page">
          {task.title}
        </span>
      </nav>

      {/* Title row */}
      <header className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <CategoryBadge category={task.category} />
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
            <FreshnessIndicator freshness={task.freshness} className="ml-1" />
            {archived ? (
              <span className="badge-soft badge-neutral">
                <ArchiveIcon className="size-3" aria-hidden="true" />
                Archived
              </span>
            ) : null}
          </div>
          <h1 className="text-foreground text-[1.625rem] leading-tight font-bold tracking-tight break-words lg:text-[2rem]">
            {task.title}
          </h1>
        </div>
        {canUseTimer && !closed ? (
          <QuickLogTrigger variant="button" label="Log hours" presetTaskId={task.id} className="h-10 rounded-xl px-4" />
        ) : null}
      </header>

      {archived ? (
        <p role="status" className="border-attention-border bg-attention-subtle text-attention-foreground mt-5 flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm">
          <ArchiveIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Archived on {task.archivedEffectiveDate}. This mission and its retained history are read-only. {task.archiveReason}
            {successor?<Link className="ml-2 font-semibold underline" href={`/tasks/${encodeURIComponent(successor.taskTag)}`}>Continue on {successor.taskTag} - {successor.title}</Link>:null}
          </span>
        </p>
      ) : null}

      {!archived&&task.reviewerIds.includes(currentUser.id) ? (
        <section className="border-primary/20 bg-primary-subtle/60 mt-5 rounded-2xl border p-4 sm:p-5" aria-label="Your review">
          <h2 className="text-foreground mb-2 flex items-center gap-2 text-sm font-bold">
            <ClipboardCheckIcon className="text-primary size-4" aria-hidden="true" />
            Your review is requested
          </h2>
          <TaskReviewForm taskId={task.id} version={task.lifecycleVersion ?? 0} />
        </section>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <main className="grid min-w-0 content-start gap-6">
          <MissionOverview data={data} assigneeNames={assigneeNames} reviewerNames={reviewerNames} overdue={overdue} />

          <ChecklistHero
            href={checklistHref}
            title={data.checklist?.title ?? null}
            itemCount={data.checklistNodes.length}
            rollup={data.checklistRollup}
          />

          {canManage ? <TaskLifecyclePanel task={task} /> : null}

          <MissionBrief
            task={task}
            sections={data.sections}
            native={native}
            templates={templates}
            canManage={canManage}
            tasks={workspace.tasks}
            members={data.members}
            reports={reports}
          />

          <WorkFilesPanel
            task={task}
            links={data.links}
            sections={data.sections}
            checklistHref={checklistHref}
            canCreateWorkFile={!archived && !closed && canUpdateTaskOwnFields(currentUser, task)}
            providerState={native.instance?.providerState ?? 'not_requested'}
          />

          <MissionPanel icon={GitBranchIcon} title="Dependency missions">
            <DependencyList dependencies={data.dependencies} taskId={task.id} />
          </MissionPanel>

          <MissionPanel
            icon={HistoryIcon}
            title="Activity & updates"
            subtitle={`${data.effort.logCount} log ${data.effort.logCount === 1 ? 'entry' : 'entries'} · ${formatHours(data.effort.hoursLogged)} h`}
          >
            <TaskLogTimeline logs={data.logs} memberNames={memberNames} />
          </MissionPanel>
        </main>

        <aside className="grid h-fit min-w-0 gap-6">
          <MissionPanel icon={TimerIcon} title="Timer">
            <TimerControl taskTag={task.taskTag} activeTimer={activeCurrentTimer} canUseTimer={canUseTimer} />
          </MissionPanel>

          <MissionPanel icon={ListChecksIcon} title="Checklist phases" action={
            <Link href={checklistHref} className="text-primary text-xs font-semibold hover:underline">Open</Link>
          }>
            <PhaseProgress rollup={data.checklistRollup} />
          </MissionPanel>

          <EffortPanel data={data} todayHours={effortBreakdown ? effortBreakdown.todayHours : null} memberNames={memberNames} />

          <MissionPanel icon={PencilIcon} title="Manual time entry">
            <ManualTimeForm taskTag={task.taskTag} canUseTimer={canUseTimer} />
          </MissionPanel>

          <MissionPanel icon={HistoryIcon} title={canManage ? 'Timer records' : 'My timer records'}>
            <TimerRecords
              timers={visibleTimers}
              memberNames={memberNames}
              taskTag={task.taskTag}
              canManage={canManage}
              currentUserId={currentUser.id}
            />
          </MissionPanel>
        </aside>
      </div>
    </div>
  );
}
