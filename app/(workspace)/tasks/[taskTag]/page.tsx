import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArchiveIcon,
  Building2Icon,
  ClipboardCheckIcon,
  GitBranchIcon,
  HashIcon,
  HistoryIcon,
  PencilIcon,
  RocketIcon,
  TimerIcon,
} from 'lucide-react';

import { QuickPostTrigger } from '@/modules/support/components/quick-post-trigger';
import { TimerButton } from '@/modules/time-tracking/components/timer-button';
import { MissionPage, MissionPageHeader, MissionPanel } from '@/shared/ui/mission-ui';
import { PermanentBadge } from '@/modules/tasks/components/permanent-badge';
import { Breadcrumb, PageTabs } from '@/shared/ui/page-nav';
import {
  CategoryBadge,
  FreshnessIndicator,
  PriorityBadge,
} from '@/shared/ui/tracker-badges';
import { getObjectiveReviews, getTaskEffortBreakdown } from '@/modules/checklists';
import { CHECKLIST_SECTIONS, NO_REVIEWS, checklistWorkHref, reviewsAwaiting, sentBackIndex } from '@/modules/checklists/client';
import { checklistCommand } from '@/modules/checklists/actions';
import { ObjectiveReviewProvider, ObjectiveReviewQueue } from '@/modules/checklists/components/objective-review';
import { canStartTimerForTask, getQuestTimes, getTaskExecution, getTimerSessionActivity } from '@/modules/time-tracking';
import { QuestTimerList } from '@/modules/time-tracking/components/quest-timers';
import {
  canEditTaskDetails,
  canManageMissionObservers,
  canManageTaskPeople,
  canManageTasks,
  canMarkMissionDone,
  canReadMissionWork,
  canWriteMissionFiles,
  canUpdateTaskOwnFields,
  getNativeDetailState,
  getNativeTemplates,
  getMissionChoices,
  getSubMissionOriginRow,
  getTaskProofs,
  normalizeTaskTagParam,
  resolveSubMissionOrigin,
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
import { MissionWorkPrivate } from '@/modules/tasks/components/detail/mission-work-private';
import { FilesPanel } from '@/modules/tasks/components/detail/files-panel';
import { MissionStatusBanner } from '@/modules/tasks/components/mission-status-prompt';
import { MissionActionsMenu } from '@/modules/tasks/components/mission-actions-menu';
import { StatusSelect } from '@/modules/tasks/components/status-select';
import { getLabelCatalogue, getLabelsFor } from '@/modules/labels';
import { getBusinesses } from '@/modules/businesses';
import { MissionBusinessSelect } from '@/modules/businesses/components/mission-business-select';
import { LabelInput } from '@/modules/labels/components/label-input';
import { LabelChips } from '@/modules/labels/components/label-chips';
import { isFileStorageReady } from '@/modules/files';
import { getMissionActivity, parseCursor } from '@/modules/records';
import { MissionActivity } from '@/modules/records/components/mission-activity';
import { getMissionWaypoints } from '@/modules/recognition';
import { WaypointCelebration } from '@/modules/recognition/components/waypoint-celebration';
import { WaypointTrack } from '@/modules/recognition/components/waypoint-track';
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
  // The profile and the mission load together (6 November 2026, speed).
  const [currentUser, { taskTag }, query] = await Promise.all([requireProfile(), params, searchParams]);
  const routeState = await resolveTaskDetailRouteState(taskTag);

  if (routeState.status !== 'ready') {
    notFound();
  }

  const { data } = routeState;
  const task = data.task;
  const archived = !!task.archivedEffectiveDate;
  const successor = data.dependencies.find((d) => d.otherTask?.id === task.handoffSuccessorId)?.otherTask;
  const canManage = canManageTasks(currentUser.role) && !archived;
  // D-A2: the mission's Crew also edit its details (migrations 108, 121).
  const canEditDetails = !archived && canEditTaskDetails(currentUser, task);
  const reviewer = task.reviewerIds.includes(currentUser.id);
  // The checklist and work content belong to the mission's people and the managing director (migration 117).
  const canReadWork = canReadMissionWork(currentUser, task);
  // Details holds only work content, so it is not offered to anyone else; ?tab=details falls back to Work.
  const tabs = canReadWork ? TABS : TABS.filter(([key]) => key !== 'details');
  const requested = query.tab;
  const tab: Tab = tabs.some(([key]) => key === requested) ? requested as Tab : 'work';
  const details = tab === 'details';
  const canWriteFiles = canWriteMissionFiles(currentUser, task);
  const memberNames = new Map(data.members.map((member) => [member.id, member.fullName]));
  const family = subMissionFamily(task.id, data.dependencies);
  // Mission activity (migration 124): who changed what on this mission; only its people read it.
  const activityBefore = tab === 'history' ? parseCursor(typeof query.before === 'string' ? query.before : null) : null;
  // Every read below runs at once (6 November 2026, speed): labels, History and the parent row
  // used to wait for this batch.
  const [
    [execution, native, templates, workspace, effortBreakdown, waypoints, proofs, sessionActivity, objectiveReviews, driveReady, quests],
    [labelCatalogue, missionLabels, businessCatalogue],
    missionActivity,
    originRow,
  ] = await Promise.all([Promise.all([
    // Work shows only the running timer; History lists every log and session.
    tab === 'history' ? getTaskExecution(task.id) : tab === 'work' ? getTaskExecution(task.id, 'running') : Promise.resolve({ timers: [], logs: [] }),
    details && canReadWork ? getNativeDetailState(task.id) : Promise.resolve(null),
    details ? getNativeTemplates() : Promise.resolve([]),
    details && canEditDetails ? getMissionChoices() : Promise.resolve([]),
    details && canReadWork ? getTaskEffortBreakdown(task.id) : Promise.resolve(null),
    // A failed read leaves the track on current progress.
    tab === 'work' ? getMissionWaypoints([task]).catch(() => null) : Promise.resolve(null),
    // Input / Process / Output files and Proofs for the Files panel (Work tab). Null for
    // anyone who may not read the mission's work: no Files panel.
    canReadWork && tab === 'work' ? getTaskProofs(task.id) : Promise.resolve(null),
    // What each timer session covered (migration 110); a failed read only hides the lines.
    tab === 'history' && canReadWork ? getTimerSessionActivity(task.id).catch(() => ({ available: false as const })) : Promise.resolve(null),
    // Objectives waiting for this reviewer (114), and the phases holding a sent-back objective
    // (the checklist summary says Changes needed); a failed read only hides them.
    tab === 'work' && !archived && canReadWork ? getObjectiveReviews(task.id).catch(() => NO_REVIEWS) : Promise.resolve(NO_REVIEWS),
    // Whether uploads reach the Shared Drive yet, so the Files panel words it honestly.
    tab === 'work' && canReadWork ? isFileStorageReady() : Promise.resolve(false),
    // Quests and their time (migration 123): a mission with Quests is timed on them. Null keeps the mission timer.
    tab !== 'details' && canReadWork ? getQuestTimes(task.id) : Promise.resolve(null),
  ]),
  // Labels (migration 112): the mission's own on every tab (header chips); the catalogue on the
  // Details tab (the mission's Labels panel). Null hides them.
  Promise.all([
    details ? getLabelCatalogue() : Promise.resolve(null),
    getLabelsFor('task', [task.id]),
    // Businesses (migration 134): the Business field on the Details tab; null hides it.
    details ? getBusinesses().catch(() => null) : Promise.resolve(null),
  ]),
  tab === 'history' && canReadWork
    ? getMissionActivity(task.id, activityBefore, memberNames).catch(() => null)
    : Promise.resolve(undefined),
  // "Created from TAG › row": the exact parent row when the viewer may read the parent's
  // checklist (migration 117); otherwise only the parent mission ("Part of TAG").
  family.parent ? getSubMissionOriginRow(task.id, family.parent.id) : Promise.resolve(null),
  ]);
  const canLabelMission = !archived && (canManage || task.assigneeIds.includes(currentUser.id));
  const awaitingReview = reviewsAwaiting(objectiveReviews);
  const sentBack = sentBackIndex(objectiveReviews);
  const changesNeeded = CHECKLIST_SECTIONS.filter((key) => sentBack.hasSection(data.checklist?.id, key));
  const canUseTimer = !archived && canStartTimerForTask(currentUser, task);
  const visibleTimers = canManage
    ? execution.timers
    : execution.timers.filter((timer) => timer.userId === currentUser.id);
  // The mission timer (no Quest); one started before the mission had Quests can still be stopped.
  const activeCurrentTimer =
    execution.timers.find((timer) => timer.userId === currentUser.id && timer.status === 'Running' && !timer.nodeId) ?? null;
  const hasQuests = (quests?.length ?? 0) > 0;
  const questTitles = new Map((quests ?? []).map((quest) => [quest.nodeId, quest.title]));

  const nameOf = (id: string) => memberNames.get(id) ?? 'Unknown';
  // Migration 121: everyone on task_assignees is Crew (equal shares); Observer reviewer rows are observers.
  const crewIds = [...new Set([task.assigneeId, ...task.assigneeIds].filter(Boolean))];
  const observerIds = task.observerIds ?? [];
  const people = {
    crew: crewIds.map(nameOf),
    reviewers: task.reviewerIds.map(nameOf),
    observers: observerIds.map(nameOf),
  };
  const related = new Set([task.assigneeId, ...task.assigneeIds, ...task.reviewerIds, ...observerIds]);
  const person = (id: string) => ({ id, name: nameOf(id) });
  // The Crew: the managing director and Managers (legacy missions are reviewed in Edit first);
  // observers: the managing director, Managers and the Crew (121).
  const canManagePeople = canManageTaskPeople(currentUser, task) && task.participantCreditMode === 'configured';
  const canManageObservers = canManageMissionObservers(currentUser, task);
  const peopleManager = canManagePeople || canManageObservers ? (
    <MissionPeopleManager
      canManageCrew={canManagePeople}
      canManageObservers={canManageObservers}
      taskId={task.id}
      version={task.lifecycleVersion ?? 0}
      crew={crewIds.map(person)}
      observers={observerIds.map(person)}
      candidates={data.members.filter((member) => member.isActive && !related.has(member.id)).map((member) => ({ id: member.id, name: member.fullName }))}
    />
  ) : null;

  const checklistHref = `/tasks/${encodeURIComponent(task.taskTag)}/checklist`;
  const origin = resolveSubMissionOrigin(family.parent, originRow);
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
            {task.isPermanent ? <PermanentBadge /> : null}
            <StatusSelect
              taskId={task.id}
              taskTag={task.taskTag}
              status={task.status}
              version={task.lifecycleVersion}
              canEdit={!archived && (canManage || canUpdateTaskOwnFields(currentUser, task))}
              canMarkDone={canMarkMissionDone(currentUser, task)}
            />
            <PriorityBadge priority={task.priority} />
            <FreshnessIndicator freshness={task.freshness} className="ml-1" />
            {origin?.kind === 'row' ? (
              <Link href={origin.href} title={`Created from ${origin.parentTag} › ${origin.path}`} className="badge-soft badge-neutral inline-flex max-w-full min-w-0 items-center gap-1 hover:underline">
                <span className="shrink-0">Created from {origin.parentTag} ›</span>
                <span className="min-w-0 truncate">{origin.label}</span>
              </Link>
            ) : origin ? (
              <Link href={origin.href} className="badge-soft badge-neutral hover:underline">
                Part of {origin.parentTag}
              </Link>
            ) : null}
            {archived ? (
              <span className="badge-soft badge-neutral">
                <ArchiveIcon className="size-3" aria-hidden="true" />
                Archived
              </span>
            ) : null}
            <LabelChips labels={missionLabels?.[task.id]} />
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
          canFinish={canMarkMissionDone(currentUser, task)}
        />
      )}

      {!archived&&(reviewer||awaitingReview.length>0) ? (
        <section className="border-primary/20 bg-primary-subtle/60 rounded-2xl border p-4 sm:p-5" aria-label="Your review">
          <h2 className="text-foreground mb-2 flex items-center gap-2 text-base font-bold tracking-tight">
            <ClipboardCheckIcon className="text-primary size-4" aria-hidden="true" />
            Your review is requested
          </h2>
          <ObjectiveReviewProvider taskId={task.id} version={task.lifecycleVersion ?? 0} action={checklistCommand} reviews={objectiveReviews} names={Object.fromEntries(memberNames)}>
            <ObjectiveReviewQueue taskTag={task.taskTag} reviews={awaitingReview} />
          </ObjectiveReviewProvider>
          {reviewer ? <TaskReviewForm taskId={task.id} version={task.lifecycleVersion ?? 0} /> : null}
        </section>
      ) : null}

      <PageTabs
        label="Mission sections"
        tabs={tabs.map(([key, label]) => ({
          href: key === 'work' ? '?' : `?tab=${key}`,
          label,
          current: tab === key,
          count: key === 'history' ? data.effort.logCount : undefined,
        }))}
      />

      {tab === 'work' ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <section className="grid min-w-0 content-start gap-6">
            {canReadWork ? (
              <>
                <WorkTabBrief sections={data.sections} />
                <ChecklistHero
                  href={checklistHref}
                  title={data.checklist?.title ?? null}
                  itemCount={data.checklistNodes.length}
                  rollup={data.checklistRollup}
                  changesNeeded={changesNeeded}
                />
              </>
            ) : <MissionWorkPrivate />}
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
            {canReadWork ? (
              <FilesPanel
                task={task}
                links={data.links}
                files={proofs}
                canUpload={canWriteFiles}
                canAddLink={canEditDetails}
                driveReady={driveReady}
              />
            ) : null}
            {waypoints?.recent.length ? <WaypointCelebration tasks={waypoints.recent} waypoints={waypoints.waypoints} /> : null}
            {canManage ? <TaskLifecyclePanel task={task} /> : null}
          </section>
          <aside className="grid h-fit min-w-0 gap-6 lg:sticky lg:top-[calc(var(--header-offset)+1.5rem)] lg:self-start">
            <MissionPanel icon={TimerIcon} title="Time" subtitle={`${formatHours(data.effort.hoursLogged)} h logged`}>
              <div className="grid gap-5">
                {hasQuests ? (
                  <>
                    <QuestTimerList
                      taskId={task.id}
                      taskTag={task.taskTag}
                      quests={quests!}
                      canTime={canUseTimer && !closed}
                      questHref={(quest) => checklistWorkHref(task.taskTag, { checklistId: quest.ownedChecklistId, section: 'activity' })}
                    />
                    {activeCurrentTimer ? <TimerControl taskTag={task.taskTag} activeTimer={activeCurrentTimer} canUseTimer={canUseTimer} /> : null}
                  </>
                ) : (
                  <TimerControl taskTag={task.taskTag} activeTimer={activeCurrentTimer} canUseTimer={canUseTimer} />
                )}
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
            {family.children.length ? (
              <MissionPanel icon={RocketIcon} title="Sub-missions" subtitle={`${family.children.filter((s) => s.status === 'Done').length} of ${family.children.length} done`}>
                <SubMissionsPanel subMissions={family.children} />
              </MissionPanel>
            ) : null}
          </aside>
        </div>
      ) : details && !canReadWork ? (
        <MissionWorkPrivate />
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
            />
            <MissionPanel icon={GitBranchIcon} title="Dependency missions">
              <DependencyList dependencies={data.dependencies} taskId={task.id} />
            </MissionPanel>
          </section>
          <aside className="grid h-fit min-w-0 gap-6 lg:sticky lg:top-[calc(var(--header-offset)+1.5rem)] lg:self-start">
            {businessCatalogue && (businessCatalogue.businesses.some((b) => !b.archived) || task.businessId) ? (
              <MissionPanel icon={Building2Icon} title="Business" subtitle="Which business this work is for; it never changes who sees the mission">
                <MissionBusinessSelect taskId={task.id} businessId={task.businessId ?? null} businesses={businessCatalogue.businesses} canEdit={canLabelMission} />
              </MissionPanel>
            ) : null}
            {labelCatalogue && missionLabels ? (
              <MissionPanel icon={HashIcon} title="Labels" subtitle="Group this mission with related work">
                <LabelInput
                  kind="task"
                  subjectId={task.id}
                  labels={missionLabels[task.id] ?? []}
                  catalogue={labelCatalogue.labels}
                  canEdit={canLabelMission}
                  canCreate={labelCatalogue.canManage}
                />
              </MissionPanel>
            ) : null}
            <EffortPanel data={data} todayHours={effortBreakdown ? effortBreakdown.todayHours : null} memberNames={memberNames} />
          </aside>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {missionActivity !== undefined ? (
            <MissionPanel
              icon={HistoryIcon}
              title="Activity"
              subtitle="Who changed what on this mission · newest first · India time"
              className="lg:col-span-2"
            >
              <MissionActivity
                page={missionActivity}
                basePath={`/tasks/${encodeURIComponent(task.taskTag)}?tab=history`}
                paged={!!activityBefore}
              />
            </MissionPanel>
          ) : null}
          <MissionPanel
            icon={HistoryIcon}
            title="Time logs"
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
              questTitles={questTitles}
            />
          </MissionPanel>
        </div>
      )}
    </MissionPage>
  );
}
