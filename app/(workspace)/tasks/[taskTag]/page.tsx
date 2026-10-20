import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArchiveIcon,
  ClipboardCheckIcon,
  GitBranchIcon,
  HistoryIcon,
  ListChecksIcon,
  PencilIcon,
  TimerIcon,
} from 'lucide-react';

import { QuickLogTrigger } from '@/modules/time-tracking/components/quick-log-trigger';
import { MissionPage, MissionPageHeader, MissionPanel } from '@/shared/ui/mission-ui';
import { Breadcrumb, PageTabs } from '@/shared/ui/page-nav';
import {
  CategoryBadge,
  FreshnessIndicator,
  PriorityBadge,
  StatusBadge,
} from '@/shared/ui/tracker-badges';
import { getTaskEffortBreakdown } from '@/modules/checklists';
import { canStartTimerForTask, getTaskExecution } from '@/modules/time-tracking';
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

import { ManualTimeForm, TimerControl, TimerRecords } from '@/modules/time-tracking/components/timer-panels';

interface TaskDetailPageProps {
  params: Promise<{
    taskTag: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const TABS = [['work', 'Work'], ['details', 'Details'], ['history', 'History']] as const;
type Tab = (typeof TABS)[number][0];

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
 * Work / Details / History tabs keep daily actions first; each tab loads only its own data.
 */
export default async function TaskDetailPage({ params, searchParams }: TaskDetailPageProps) {
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
  const requested = (await searchParams).tab;
  const tab: Tab = TABS.some(([key]) => key === requested) ? requested as Tab : 'work';
  const details = tab === 'details';
  const [execution, native, templates, workspace, reports, effortBreakdown] = await Promise.all([
    tab !== 'details' ? getTaskExecution(task.id) : Promise.resolve({ timers: [], logs: [] }),
    details ? getNativeDetailState(task.id) : Promise.resolve(null),
    details ? getNativeTemplates() : Promise.resolve([]),
    details && canManage ? getTaskWorkspaceData() : Promise.resolve({ tasks: [], members: [] }),
    details && canManage ? getVisibleReportChoices() : Promise.resolve([]),
    details ? getTaskEffortBreakdown(task.id) : Promise.resolve(null),
  ]);
  const canUseTimer = !archived && canStartTimerForTask(currentUser, task);
  const visibleTimers = canManage
    ? execution.timers
    : execution.timers.filter((timer) => timer.userId === currentUser.id);
  const activeCurrentTimer =
    execution.timers.find((timer) => timer.userId === currentUser.id && timer.status === 'Running') ?? null;

  const memberNames = new Map(data.members.map((member) => [member.id, member.fullName]));
  const assigneeNames = task.assigneeIds.map((id) => memberNames.get(id) ?? 'Unknown');
  const reviewerNames = task.reviewerIds.map((id) => memberNames.get(id) ?? 'Unknown');

  const checklistHref = `/tasks/${encodeURIComponent(task.taskTag)}/checklist`;
  const closed = task.status === 'Done' || task.status === 'Discarded';
  const overdue = isOverdue(task.dueDate) && !closed;

  return (
    <MissionPage>
      <MissionPageHeader
        breadcrumb={
          <Breadcrumb
            back={{ href: '/tasks', label: 'Back to missions' }}
            items={[
              { label: 'Missions', href: '/tasks' },
              { label: task.taskTag, tag: true },
              { label: task.title },
            ]}
          />
        }
        meta={
          <>
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
          </>
        }
        title={task.title}
        actions={canUseTimer && !closed ? (
          <QuickLogTrigger variant="button" label="Log hours" presetTaskId={task.id} className="h-10 px-4" />
        ) : null}
      />

      {archived ? (
        <p role="status" className="border-attention-border bg-attention-subtle text-attention-foreground flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm">
          <ArchiveIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Archived on {task.archivedEffectiveDate}. This mission and its retained history are read-only. {task.archiveReason}
            {successor?<Link className="link ml-2 font-semibold" href={`/tasks/${encodeURIComponent(successor.taskTag)}`}>Continue on {successor.taskTag} - {successor.title}</Link>:null}
          </span>
        </p>
      ) : null}

      {!archived&&task.reviewerIds.includes(currentUser.id) ? (
        <section className="border-primary/20 bg-primary-subtle/60 rounded-2xl border p-4 sm:p-5" aria-label="Your review">
          <h2 className="text-foreground mb-2 flex items-center gap-2 text-base font-bold tracking-tight">
            <ClipboardCheckIcon className="text-primary size-4" aria-hidden="true" />
            Your review is requested
          </h2>
          <TaskReviewForm taskId={task.id} version={task.lifecycleVersion ?? 0} />
        </section>
      ) : null}

      <PageTabs
        label="Mission sections"
        tabs={TABS.map(([key, label]) => ({
          href: key === 'work' ? '?' : `?tab=${key}`,
          label,
          current: tab === key,
          count: key === 'history' ? data.effort.logCount : undefined,
        }))}
      />

      {tab === 'work' ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <main className="grid min-w-0 content-start gap-6">
            <ChecklistHero
              href={checklistHref}
              title={data.checklist?.title ?? null}
              itemCount={data.checklistNodes.length}
              rollup={data.checklistRollup}
            />
            <MissionOverview data={data} assigneeNames={assigneeNames} reviewerNames={reviewerNames} overdue={overdue} />
            {canManage ? <TaskLifecyclePanel task={task} /> : null}
          </main>
          <aside className="grid h-fit min-w-0 gap-6">
            <MissionPanel icon={TimerIcon} title="Timer">
              <TimerControl taskTag={task.taskTag} activeTimer={activeCurrentTimer} canUseTimer={canUseTimer} />
            </MissionPanel>
            <MissionPanel icon={ListChecksIcon} title="Checklist phases" action={
              <Link href={checklistHref} className="link text-xs font-semibold">Open</Link>
            }>
              <PhaseProgress rollup={data.checklistRollup} href={checklistHref} />
            </MissionPanel>
            <MissionPanel icon={PencilIcon} title="Manual time entry">
              <ManualTimeForm taskTag={task.taskTag} canUseTimer={canUseTimer} />
            </MissionPanel>
          </aside>
        </div>
      ) : details && native ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <main className="grid min-w-0 content-start gap-6">
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
          </main>
          <aside className="grid h-fit min-w-0 gap-6">
            <EffortPanel data={data} todayHours={effortBreakdown ? effortBreakdown.todayHours : null} memberNames={memberNames} />
          </aside>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <MissionPanel
            icon={HistoryIcon}
            title="Activity & updates"
            subtitle={`${data.effort.logCount} log ${data.effort.logCount === 1 ? 'entry' : 'entries'} · ${formatHours(data.effort.hoursLogged)} h`}
          >
            <TaskLogTimeline logs={execution.logs} memberNames={memberNames} />
          </MissionPanel>
          <MissionPanel icon={HistoryIcon} title={canManage ? 'Timer records' : 'My timer records'} className="h-fit">
            <TimerRecords
              timers={visibleTimers}
              memberNames={memberNames}
              taskTag={task.taskTag}
              canManage={canManage}
              currentUserId={currentUser.id}
            />
          </MissionPanel>
        </div>
      )}
    </MissionPage>
  );
}
