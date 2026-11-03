import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArchiveIcon,
  ClipboardCheckIcon,
  GitBranchIcon,
  HistoryIcon,
  PencilIcon,
  RocketIcon,
  TimerIcon,
} from 'lucide-react';

import { QuickPostTrigger } from '@/modules/support/components/quick-post-trigger';
import { TimerButton } from '@/modules/time-tracking/components/timer-button';
import { MissionPage, MissionPageHeader, MissionPanel } from '@/shared/ui/mission-ui';
import { Breadcrumb, PageTabs } from '@/shared/ui/page-nav';
import {
  CategoryBadge,
  FreshnessIndicator,
  PriorityBadge,
} from '@/shared/ui/tracker-badges';
import { getTaskEffortBreakdown } from '@/modules/checklists';
import { canStartTimerForTask, getTaskExecution, getTimerSessionActivity } from '@/modules/time-tracking';
import {
  canEditTaskDetails,
  canManageTaskPeople,
  canManageTasks,
  canUpdateTaskOwnFields,
  isTaskWorker,
  getNativeDetailState,
  getNativeTemplates,
  getMissionChoices,
  getVisibleReportChoices,
  getTaskProofs,
  normalizeTaskTagParam,
  resolveTaskDetailRouteState,
} from '@/modules/tasks';
import { ChecklistHero } from '@/modules/tasks/components/detail/checklist-summary';
import { DependencyList } from '@/modules/tasks/components/detail/dependency-list';
import { SubMissionsPanel, subMissionFamily } from '@/modules/tasks/components/detail/sub-missions-panel';
import { EffortPanel } from '@/modules/tasks/components/detail/effort-panel';
import { TaskLogTimeline } from '@/modules/tasks/components/detail/log-timeline';
import { MissionBrief } from '@/modules/tasks/components/detail/mission-brief';
import { MissionOverview } from '@/modules/tasks/components/detail/mission-overview';
import { MissionPeopleManager } from '@/modules/tasks/components/detail/mission-people';
import { ProofsPanel } from '@/modules/tasks/components/detail/proofs-panel';
import { MissionStatusBanner } from '@/modules/tasks/components/mission-status-prompt';
import { MissionActionsMenu } from '@/modules/tasks/components/mission-actions-menu';
import { StatusSelect } from '@/modules/tasks/components/status-select';
import { getMissionLearnings } from '@/modules/learning';
import { LearningCountChip } from '@/modules/learning/components/learning-count-chip';
import { LearningPanel } from '@/modules/learning/components/learning-panel';
import { getMissionWaypoints } from '@/modules/recognition';
import { WaypointCelebration } from '@/modules/recognition/components/waypoint-celebration';
import { WaypointTrack } from '@/modules/recognition/components/waypoint-track';
import { WorkFilesPanel } from '@/modules/tasks/components/detail/work-files-panel';
import { WorkTabBrief } from '@/modules/tasks/components/detail/work-tab-brief';
import { TaskLifecyclePanel } from '@/modules/tasks/components/task-lifecycle-panel';
import { TaskReviewForm } from '@/modules/tasks/components/task-review-form';
import { requireProfile } from '@/shared/session/profile';
import { formatDate, formatHours, isOverdue } from '@/shared/tracker/format';

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
    title: `${normalizedTaskTag ?? 'Mission'}`,
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
  // D-A2: the mission's Owner, assignees and collaborators also edit its details (migration 108).
  const canEditDetails = !archived && canEditTaskDetails(currentUser, task);
  const requested = (await searchParams).tab;
  const tab: Tab = TABS.some(([key]) => key === requested) ? requested as Tab : 'work';
  const details = tab === 'details';
  const [execution, native, templates, workspace, reports, effortBreakdown, waypoints, proofs, learnings, sessionActivity] = await Promise.all([
    tab !== 'details' ? getTaskExecution(task.id) : Promise.resolve({ timers: [], logs: [] }),
    details ? getNativeDetailState(task.id) : Promise.resolve(null),
    details ? getNativeTemplates() : Promise.resolve([]),
    details && canEditDetails ? getMissionChoices() : Promise.resolve([]),
    details && canManage ? getVisibleReportChoices() : Promise.resolve([]),
    details ? getTaskEffortBreakdown(task.id) : Promise.resolve(null),
    // A failed read leaves the track on current progress.
    tab === 'work' ? getMissionWaypoints([task]).catch(() => null) : Promise.resolve(null),
    // Proofs (Work tab) and Input / Process / Output documents (Details tab). Null when the
    // caller is not one of the mission's people or a manager: no panel, no uploads.
    tab === 'work' || details ? getTaskProofs(task.id) : Promise.resolve(null),
    // Mistakes and learning (migration 111): the panel on Details, its count on Work. Null hides both.
    tab !== 'history' ? getMissionLearnings(task.id) : Promise.resolve(null),
    // What each timer session covered (migration 110); a failed read only hides the lines.
    tab === 'history' ? getTimerSessionActivity(task.id).catch(() => ({ available: false as const })) : Promise.resolve(null),
  ]);
  const canUseTimer = !archived && canStartTimerForTask(currentUser, task);
  const visibleTimers = canManage
    ? execution.timers
    : execution.timers.filter((timer) => timer.userId === currentUser.id);
  const activeCurrentTimer =
    execution.timers.find((timer) => timer.userId === currentUser.id && timer.status === 'Running') ?? null;

  const memberNames = new Map(data.members.map((member) => [member.id, member.fullName]));
  const nameOf = (id: string) => memberNames.get(id) ?? 'Unknown';
  // Migration 108: zero-share assignees are collaborators; Observer reviewer rows are observers.
  const collaboratorIds = task.collaboratorIds ?? [];
  const observerIds = task.observerIds ?? [];
  const creditedIds = task.assigneeIds.filter((id) => id !== task.assigneeId && isTaskWorker(task, id));
  const people = {
    owner: task.assigneeId ? [nameOf(task.assigneeId)] : [],
    assignees: creditedIds.map(nameOf),
    collaborators: collaboratorIds.map(nameOf),
    reviewers: task.reviewerIds.map(nameOf),
    observers: observerIds.map(nameOf),
  };
  const related = new Set([task.assigneeId, ...task.assigneeIds, ...task.reviewerIds, ...observerIds]);
  const person = (id: string) => ({ id, name: nameOf(id) });
  const peopleManager = canManageTaskPeople(currentUser, task) ? (
    <MissionPeopleManager
      taskId={task.id}
      version={task.lifecycleVersion ?? 0}
      owner={task.assigneeId ? person(task.assigneeId) : null}
      assignees={task.participantCreditMode === 'configured' ? creditedIds.map(person) : []}
      collaborators={collaboratorIds.map(person)}
      observers={observerIds.map(person)}
      candidates={data.members.filter((member) => member.isActive && !related.has(member.id)).map((member) => ({ id: member.id, name: member.fullName }))}
    />
  ) : null;

  const checklistHref = `/tasks/${encodeURIComponent(task.taskTag)}/checklist`;
  const family = subMissionFamily(task.id, data.dependencies);
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
              ...(family.parent ? [{ label: family.parent.taskTag, href: `/tasks/${encodeURIComponent(family.parent.taskTag)}`, tag: true }] : []),
              { label: task.taskTag, tag: true },
              { label: task.title },
            ]}
          />
        }
        meta={
          <>
            <CategoryBadge category={task.category} />
            <StatusSelect
              taskId={task.id}
              taskTag={task.taskTag}
              status={task.status}
              version={task.lifecycleVersion}
              canEdit={!archived && (canManage || canUpdateTaskOwnFields(currentUser, task))}
            />
            <PriorityBadge priority={task.priority} />
            <FreshnessIndicator freshness={task.freshness} className="ml-1" />
            {family.parent ? (
              <Link href={`/tasks/${encodeURIComponent(family.parent.taskTag)}`} className="badge-soft badge-neutral hover:underline">
                Part of {family.parent.taskTag}
              </Link>
            ) : null}
            {archived ? (
              <span className="badge-soft badge-neutral">
                <ArchiveIcon className="size-3" aria-hidden="true" />
                Archived
              </span>
            ) : null}
          </>
        }
        title={task.title}
        actions={archived ? null : (
          <>
            <QuickPostTrigger presetTaskId={task.id} label="Post about this mission" />
            {canUseTimer && !closed ? <TimerButton taskId={task.id} taskLabel={task.taskTag} size="default" /> : null}
            <MissionActionsMenu taskId={task.id} taskTag={task.taskTag} openHref={null} variant="button" />
          </>
        )}
      />

      {archived ? (
        <p role="status" className="border-attention-border bg-attention-subtle text-attention-foreground flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm">
          <ArchiveIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Archived on {formatDate(task.archivedEffectiveDate ?? null)}. This mission and its retained history are read-only. {task.archiveReason}
            {successor?<Link className="link ml-2 font-semibold" href={`/tasks/${encodeURIComponent(successor.taskTag)}`}>Continue on {successor.taskTag} - {successor.title}</Link>:null}
          </span>
        </p>
      ) : null}

      {archived ? null : (
        <MissionStatusBanner
          taskId={task.id}
          taskTag={task.taskTag}
          status={task.status}
          hasWork={(task.progressPercentage ?? 0) > 0 || data.effort.hoursLogged > 0}
          readyToFinish={data.checklistRollup?.isComplete === true}
          canChange={canManage || canUpdateTaskOwnFields(currentUser, task)}
        />
      )}

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
          <section className="grid min-w-0 content-start gap-6">
            <WorkTabBrief sections={data.sections} extra={learnings ? <LearningCountChip learnings={learnings} /> : null} />
            <ChecklistHero
              href={checklistHref}
              title={data.checklist?.title ?? null}
              itemCount={data.checklistNodes.length}
              rollup={data.checklistRollup}
            />
            <MissionOverview
              data={data}
              people={people}
              peopleManager={peopleManager}
              overdue={overdue}
              belowProgress={
                <WaypointTrack
                  progress={task.progressPercentage}
                  reachedKeys={waypoints?.reached[task.id]}
                  waypoints={waypoints?.waypoints}
                  taskTag={task.taskTag}
                  variant="full"
                  stopped={archived || task.status === 'Discarded'}
                />
              }
            />
            {waypoints?.recent.length ? <WaypointCelebration tasks={waypoints.recent} waypoints={waypoints.waypoints} /> : null}
            {canManage ? <TaskLifecyclePanel task={task} /> : null}
          </section>
          <aside className="grid h-fit min-w-0 gap-6 lg:sticky lg:top-[calc(var(--header-offset)+1.5rem)] lg:self-start">
            <MissionPanel icon={TimerIcon} title="Time" subtitle={`${formatHours(data.effort.hoursLogged)} h logged`}>
              <div className="grid gap-5">
                <TimerControl taskTag={task.taskTag} activeTimer={activeCurrentTimer} canUseTimer={canUseTimer} />
                {canUseTimer ? (
                  <details className="group border-border border-t pt-4">
                    <summary className="text-foreground flex cursor-pointer list-none items-center gap-2 text-sm font-semibold">
                      <PencilIcon className="text-primary size-4" aria-hidden="true" />
                      Add time by hand
                    </summary>
                    <div className="mt-3">
                      <ManualTimeForm taskTag={task.taskTag} canUseTimer={canUseTimer} />
                    </div>
                  </details>
                ) : null}
              </div>
            </MissionPanel>
            {proofs ? <ProofsPanel taskId={task.id} taskTag={task.taskTag} proofs={proofs} canAdd={!archived} /> : null}
            {family.children.length ? (
              <MissionPanel icon={RocketIcon} title="Sub-missions" subtitle={`${family.children.filter((s) => s.status === 'Done').length} of ${family.children.length} done`}>
                <SubMissionsPanel subMissions={family.children} />
              </MissionPanel>
            ) : null}
          </aside>
        </div>
      ) : details && native ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="grid min-w-0 content-start gap-6">
            <MissionBrief
              task={task}
              sections={data.sections}
              native={native}
              templates={templates}
              canManage={canManage}
              canEditDetails={canEditDetails}
              tasks={workspace}
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
              files={proofs}
              canAddFiles={!archived}
            />
            {learnings ? <LearningPanel taskId={task.id} taskTag={task.taskTag} learnings={learnings} /> : null}
            <MissionPanel icon={GitBranchIcon} title="Dependency missions">
              <DependencyList dependencies={data.dependencies} taskId={task.id} />
            </MissionPanel>
          </section>
          <aside className="grid h-fit min-w-0 gap-6 lg:sticky lg:top-[calc(var(--header-offset)+1.5rem)] lg:self-start">
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
          <MissionPanel icon={HistoryIcon} title={canManage ? 'Timer records' : 'My timer records'} className="h-fit lg:sticky lg:top-[calc(var(--header-offset)+1.5rem)] lg:self-start">
            <TimerRecords
              timers={visibleTimers}
              memberNames={memberNames}
              taskTag={task.taskTag}
              canManage={canManage}
              currentUserId={currentUser.id}
              sessionActivity={sessionActivity?.available ? sessionActivity.sessions : undefined}
            />
          </MissionPanel>
        </div>
      )}
    </MissionPage>
  );
}
