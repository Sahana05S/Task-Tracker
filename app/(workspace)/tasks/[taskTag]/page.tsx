import { DETAIL_FIELDS,ipoLinks,sectionsForRole } from '@/lib/tasks/details-contract';
import { NativeDetailsEditor,InitializeDetailsForm } from '@/components/tasks/native-details-editor';
import { getNativeDetailState,getNativeTemplates,getVisibleReportChoices } from '@/lib/tasks/native-details';
import { getTaskWorkspaceData } from '@/lib/tasks/queries';
import { TaskLifecyclePanel } from '@/components/tasks/task-lifecycle-panel';
import { ELIGIBILITY_LABELS,kolkataDate } from '@/lib/tasks/contract';
import { ExecutionForm } from '@/components/tasks/execution-form';
import { TaskReviewForm } from '@/components/tasks/task-review-form';
import type { Metadata } from 'next';
import type * as React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArchiveIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarDaysIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  CircleDotIcon,
  ClipboardCheckIcon,
  ExternalLinkIcon,
  FileTextIcon,
  FolderIcon,
  GaugeIcon,
  GitBranchIcon,
  HistoryIcon,
  LinkIcon,
  ListChecksIcon,
  PaperclipIcon,
  PenToolIcon,
  PencilIcon,
  TimerIcon,
  TriangleAlertIcon,
  UserIcon,
  type LucideIcon,
} from 'lucide-react';

import { QuickLogTrigger } from '@/components/logs/quick-log-trigger';
import {
  InitialsAvatar,
  MissionPanel,
  MissionProgress,
} from '@/components/missions/mission-ui';
import { Button } from '@/components/ui/button';
import {
  CategoryBadge,
  FreshnessIndicator,
  PriorityBadge,
  StatusBadge,
} from '@/components/tracker/tracker-badges';
import { requireProfile } from '@/lib/auth/profile';
import { getTaskEffortBreakdown } from '@/lib/checklists/item-time';
import type { ChecklistRollup, ChecklistSection, SectionProgress } from '@/lib/checklists/progress';
import {
  normalizeTaskTagParam,
  resolveTaskDetailRouteState,
  type TaskDependencyDetail,
} from '@/lib/tasks/detail';
import { canManageTasks } from '@/lib/tasks/permissions';
import { canStartTimerForTask } from '@/lib/timers/permissions';
import { CATEGORY_LABELS } from '@/lib/tracker/enums';
import { formatDate, formatNumeric, formatPercent, formatHours, isOverdue } from '@/lib/tracker/format';
import { cn } from '@/lib/utils';
import type {
  DailyTaskLog,
  TaskDetailSection,
  TaskLink,
  TaskTimer,
} from '@/types/tracker';

import {
  discardTaskTimer,
  enterManualTaskTime,
  startTaskTimer,
  stopTaskTimer,
} from './timer-actions';

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

/** Shared form-control look for the native forms on this page. */
const FIELD = 'border-input bg-background rounded-xl border px-3 text-sm';

/**
 * Mission details (layout references: Stitch mission_details_1 for phones and
 * mission_details_2 for desktop). Every figure is the existing task data under
 * the caller's permissions; no star credits or other new rules are shown.
 */
export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
  const currentUser = await requireProfile();

  const { taskTag } = await params;
  const routeState = await resolveTaskDetailRouteState(taskTag);

  if (routeState.status !== 'ready') {
    notFound();
  }

  const { data } = routeState;
  const archived=!!data.task.archivedEffectiveDate;
  const successor=data.dependencies.find(d=>d.otherTask?.id===data.task.handoffSuccessorId)?.otherTask;
  const canManage = canManageTasks(currentUser.role)&&!archived;
  const [native,templates,workspace,reports,effortBreakdown]=await Promise.all([getNativeDetailState(data.task.id),getNativeTemplates(),canManage?getTaskWorkspaceData():Promise.resolve({tasks:[],members:[]}),canManage?getVisibleReportChoices():Promise.resolve([]),getTaskEffortBreakdown(data.task.id)]);
  const canUseTimer = !archived&&canStartTimerForTask(currentUser, data.task);
  const visibleTimers = canManage
    ? data.timers
    : data.timers.filter((timer) => timer.userId === currentUser.id);
  const activeCurrentTimer =
    data.timers.find(
      (timer) => timer.userId === currentUser.id && timer.status === 'Running',
    ) ?? null;

  const memberNames = new Map(
    data.members.map((member) => [member.id, member.fullName]),
  );
  const assigneeNames = data.task.assigneeIds.map(
    (assigneeId) => memberNames.get(assigneeId) ?? 'Unknown',
  );
  const reviewerNames = data.task.reviewerIds.map(
    (reviewerId) => memberNames.get(reviewerId) ?? 'Unknown',
  );
  const sectionsByKey = new Map(
    data.sections.map((section) => [section.keyName, section]),
  );
  const smartFields=DETAIL_FIELDS.filter(f=>f.group==='smart');
  const smartGoals=smartFields.map(f=>sectionValue(sectionsByKey,f.key));

  const task = data.task;
  const checklistHref = `/tasks/${encodeURIComponent(task.taskTag)}/checklist`;
  const closed = task.status === 'Done' || task.status === 'Discarded';
  const overdue = isOverdue(task.dueDate) && !closed;
  const nativeDescription = sectionValue(sectionsByKey, 'description');
  const template = templates.find(t=>t.id===native.instance?.templateVersionId);
  const referenceLinks = data.links.filter(l=>!l.ipoRole || l.ipoRole==='reference');

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
          {/* Overview. This is the page's first definition list, holding the
              core facts (status, dates and people). */}
          <section className="soft-card p-5 sm:p-6" aria-label="Mission overview">
            <p className="eyebrow">{CATEGORY_LABELS[task.category]}</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-foreground text-sm font-semibold">Overall progress</span>
              <span className="text-success-strong text-xl font-bold tabular-nums">
                {formatPercent(task.progressPercentage)}
              </span>
            </div>
            <MissionProgress value={task.progressPercentage} label="Overall progress" className="mt-2 h-2.5" />
            <p className="text-muted-foreground mt-2 text-xs">
              Activity checklist {formatPercent(data.checklistProgressPercentage)} ·{' '}
              {formatHours(data.effort.hoursLogged)} h logged
            </p>

            <dl className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-3">
              <FactTile icon={CircleDotIcon} label="Status" value={task.status} />
              <FactTile
                icon={CalendarDaysIcon}
                label="Due"
                value={formatDate(task.dueDate)}
                note={overdue ? 'Overdue' : undefined}
                alert={overdue}
              />
              <FactTile icon={CalendarDaysIcon} label="Assigned" value={formatDate(task.assignedDate)} />
              <FactTile icon={CheckCircle2Icon} label="Completed" value={formatDate(task.completedDate)} />
              <FactTile
                icon={CheckCircle2Icon}
                label="Met deadline"
                value={task.metDeadline === null ? '—' : task.metDeadline ? 'Yes' : 'No'}
              />
              <FactTile
                icon={GaugeIcon}
                label="Task freshness"
                value={task.freshness ?? `Unavailable: ${task.freshnessReason ?? "date evidence missing"}`}
              />
              <PeopleTile label="Assignees" names={assigneeNames} fallback="Unassigned" />
              <PeopleTile label="Reviewers" names={reviewerNames} fallback="No reviewer" />
            </dl>
          </section>

          <ChecklistHero
            href={checklistHref}
            title={data.checklist?.title ?? null}
            itemCount={data.checklistNodes.length}
            rollup={data.checklistRollup}
          />

          {canManage ? <TaskLifecyclePanel task={task} /> : null}

          <MissionPanel
            icon={FileTextIcon}
            title="Mission brief & scope"
            action={
              <span className={cn('badge-soft', native.instance ? 'badge-status-done' : 'badge-neutral')}>
                {native.instance?'Native task/details ready':'Native details not initialized'}
              </span>
            }
          >
            <div className="grid gap-5">
              {task.description ? (
                <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap">{task.description}</p>
              ) : null}
              {nativeDescription && nativeDescription !== task.description ? (
                <TextBlock title="Description" body={nativeDescription} />
              ) : null}
              {!task.description && !nativeDescription ? (
                <p className="text-muted-foreground text-sm">No description has been written yet.</p>
              ) : null}

              <div className="bg-muted/70 rounded-xl px-4 py-3">
                <p className="eyebrow text-muted-foreground">Details needed</p>
                <p className="text-foreground mt-1 text-sm">
                  {sectionValue(sectionsByKey, 'task_details_needed') ?? '[Direct Task]'}
                </p>
              </div>

              <div>
                <h3 className="text-foreground mb-2 text-sm font-semibold">SMART goal statements</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {smartFields.map(f=>f.label).map((label, index) => (
                    <SmartGoalTile key={label} label={label} value={smartGoals[index]} />
                  ))}
                </div>
              </div>

              {sectionValue(sectionsByKey,'reviewer_notes')?<TextBlock title="Reviewer notes" body={sectionValue(sectionsByKey,'reviewer_notes')!}/>:null}
              {task.comments ? <TextBlock title="Comments" body={task.comments} /> : null}

              {native.instance ? (
                <Disclosure summary={`Template instructions · ${template?.name ?? 'Template'} · version ${template?.version}`}>
                  <div className="grid gap-2 text-sm">
                    {DETAIL_FIELDS.map(f=>native.instance?.instructions[f.key]?<p key={f.key}><strong>{f.label}:</strong> {native.instance.instructions[f.key]}</p>:null)}
                  </div>
                </Disclosure>
              ) : canManage ? (
                <div className="bg-muted/70 grid gap-2 rounded-xl p-4">
                  <InitializeDetailsForm task={task} templates={templates}/>
                </div>
              ) : null}

              {canManage ? (
                <Disclosure summary="Edit structured details and links" icon={PencilIcon}>
                  <NativeDetailsEditor task={task} sections={data.sections} tasks={workspace.tasks} members={data.members} reports={reports}/>
                </Disclosure>
              ) : null}

              {native.flags.length ? (
                <Disclosure summary={`Legacy content retained · review required (${native.flags.length})`} icon={TriangleAlertIcon}>
                  <div className="grid gap-3 text-sm">
                    {native.flags.map(flag=>{const source=data.sections.find(s=>s.id===flag.source_section_id);return <div key={flag.id}><p className="font-medium">{source?.title} · {flag.reason}</p><p className="text-muted-foreground whitespace-pre-wrap">{source?.content}</p></div>;})}
                  </div>
                </Disclosure>
              ) : null}
            </div>
          </MissionPanel>

          <MissionPanel
            icon={PaperclipIcon}
            title="Work files & assets"
            subtitle="Manual work-file links (Drive automation deferred)"
          >
            <div className="grid gap-5">
              <div className="grid gap-5 xl:grid-cols-3">
                <AssetGroup
                  title="Inputs"
                  empty="No mission inputs have been linked."
                  links={ipoLinks(data.links,'input')}
                  sections={sectionsForRole(data.sections,'input')}
                />
                <AssetGroup
                  title="Process"
                  empty="No process links have been added."
                  links={ipoLinks(data.links,'process')}
                  sections={sectionsForRole(data.sections,'process')}
                  extraLink={{ label: 'Master checklist', href: checklistHref }}
                />
                <AssetGroup
                  title="Outputs"
                  empty="No mission outputs have been linked."
                  links={ipoLinks(data.links,'output')}
                  sections={sectionsForRole(data.sections,'output')}
                />
              </div>

              {referenceLinks.length > 0 ? (
                <div className="grid gap-2">
                  <h3 className="eyebrow text-muted-foreground">References</h3>
                  {data.links.some(l=>!l.ipoRole)?<p className="text-muted-foreground text-sm">Legacy links have no confirmed IPO role and are retained here for review.</p>:null}
                  {referenceLinks.map(l=><AssetLink key={l.id} link={l}/>)}
                </div>
              ) : null}

              <p className="text-muted-foreground border-border border-t pt-3 text-xs">
                Provider work: {native.instance?.providerState??'not_requested'}. Automatic Google Drive operations are unavailable; integration is deferred. Existing asset links remain available.
              </p>
            </div>
          </MissionPanel>

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
            <TimerControl
              taskTag={task.taskTag}
              activeTimer={activeCurrentTimer}
              canUseTimer={canUseTimer}
            />
          </MissionPanel>

          <MissionPanel icon={ListChecksIcon} title="Checklist phases" action={
            <Link href={checklistHref} className="text-primary text-xs font-semibold hover:underline">Open</Link>
          }>
            <PhaseProgress rollup={data.checklistRollup} />
          </MissionPanel>

          <MissionPanel icon={GaugeIcon} title="Effort & scoring inputs">
            <dl className="grid gap-2.5">
              <CompactMetric label="Scale" value={formatNumeric(task.taskScale)} />
              <CompactMetric label="Progress" value={formatPercent(task.progressPercentage)} />
              <CompactMetric label="Scaled progress" value={formatNumeric(task.scaledProgress)} />
              <CompactMetric label="Activity checklist progress" value={formatPercent(data.checklistProgressPercentage)} />
              <CompactMetric label="Total hours" value={formatHours(data.effort.hoursLogged)} />
              <CompactMetric label="Hours worked today" value={effortBreakdown ? formatHours(effortBreakdown.todayHours) : 'Unavailable'} />
              <CompactMetric label="Task productivity" value={formatNumeric(task.taskProductivity)} />
              <CompactMetric label="Log entries" value={String(data.effort.logCount)} />
              <CompactMetric label="Metrics eligible" value={task.validForMetrics ? 'Yes' : 'No'} />
            </dl>
            <div className="border-border text-muted-foreground mt-4 grid gap-2 border-t pt-3 text-xs">
              <p>Metric eligibility: {task.validForMetrics ? "Eligible" : (task.eligibilityReasons ?? []).map(reason=>ELIGIBILITY_LABELS[reason] ?? reason).join(", ")}. Hours are required separately for productivity.</p>
              <p>Participant shares: {task.participantShares ? Object.entries(task.participantShares).map(([id,units])=>`${memberNames.get(id) ?? id}: ${units/10000}%`).join(", ") : "Legacy attribution awaiting reconciliation"}. Completion, criticality and freshness attribution remain undecided for shared work.</p>
            </div>
          </MissionPanel>

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

/* -------------------------------------------------------------------------- */
/* Overview                                                                   */
/* -------------------------------------------------------------------------- */

function FactTile({
  icon: Icon,
  label,
  value,
  note,
  alert = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note?: string;
  alert?: boolean;
}) {
  return (
    <div className="bg-muted/70 flex min-w-0 items-start gap-2.5 rounded-xl px-3 py-3 sm:gap-3 sm:px-3.5">
      <span aria-hidden="true" className="text-primary hidden size-8 shrink-0 items-center justify-center rounded-lg bg-white sm:flex">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
        <dd className={cn('text-foreground mt-0.5 text-sm font-semibold break-words', alert && 'text-rose-700')}>
          {value}
          {note ? <span className="ml-1.5 text-xs font-semibold text-rose-700">· {note}</span> : null}
        </dd>
      </div>
    </div>
  );
}

/** People with initials avatars; the avatar letters are not part of the text. */
function PeopleTile({
  label,
  names,
  fallback,
}: {
  label: string;
  names: readonly string[];
  fallback: string;
}) {
  return (
    <div className="bg-muted/70 col-span-2 rounded-xl px-3.5 py-3 xl:col-span-3">
      <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
      <dd className="mt-2 flex flex-wrap gap-2">
        {names.length === 0 ? (
          <span className="text-muted-foreground text-sm">{fallback}</span>
        ) : (
          names.map((name, index) => (
            <span key={`${name}-${index}`} className="flex items-center gap-2 rounded-full bg-white py-1 pr-3 pl-1 text-sm font-medium shadow-(--shadow-card)">
              <InitialsAvatar name={name} tone={index} className="size-7 text-[10px]" />
              {name}
            </span>
          ))
        )}
      </dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Master checklist                                                           */
/* -------------------------------------------------------------------------- */

const SECTION_LABELS: Record<ChecklistSection, string> = {
  setup: 'Setup',
  activity: 'Activity',
  closure: 'Closure',
};

const SECTION_ORDER: readonly ChecklistSection[] = ['setup', 'activity', 'closure'];

function sectionStateLabel(section: SectionProgress): string {
  switch (section.state) {
    case 'complete': return 'Complete';
    case 'partial': return 'In progress';
    case 'not_applicable': return 'Not applicable';
    case 'uninitialized': return 'Not initialized';
    case 'missing': return 'Not set up';
    case 'invalid': return 'Needs attention';
  }
}

function SectionStateIcon({ section, className }: { section: SectionProgress; className?: string }) {
  if (section.state === 'complete' || section.state === 'not_applicable') {
    return <CheckCircle2Icon className={cn('text-success-strong', className)} aria-hidden="true" />;
  }
  if (section.state === 'invalid') {
    return <TriangleAlertIcon className={cn('text-rose-700', className)} aria-hidden="true" />;
  }
  if (section.state === 'partial') {
    return <CircleDotIcon className={cn('text-recognition-foreground', className)} aria-hidden="true" />;
  }
  return <CircleDashedIcon className={cn('text-muted-foreground', className)} aria-hidden="true" />;
}

function ChecklistHero({
  href,
  title,
  itemCount,
  rollup,
}: {
  href: string;
  title: string | null;
  itemCount: number;
  rollup?: ChecklistRollup;
}) {
  return (
    <section
      aria-label="Master checklist"
      className="border-primary/15 relative overflow-hidden rounded-2xl border bg-linear-135 from-[#ece9ff] via-[#f3f0ff] to-[#fff4e2] p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1">
          <span className="text-primary-subtle-foreground inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold tracking-[0.06em] uppercase">
            <ClipboardCheckIcon className="size-3.5" aria-hidden="true" />
            Master checklist
          </span>
          <h2 className="text-foreground mt-3 text-xl font-bold tracking-tight">
            {title ?? 'No checklist created yet'}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {title
              ? `${itemCount} checklist item${itemCount === 1 ? '' : 's'} across Setup, Activity and Closure.`
              : 'Create or attach a master checklist in the checklist module.'}
          </p>
          {rollup ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {SECTION_ORDER.map((key) => (
                <li key={key} className="flex items-center gap-1.5 rounded-full bg-white/80 px-2.5 py-1 text-xs font-medium">
                  <SectionStateIcon section={rollup.sections[key]} className="size-3.5" />
                  {SECTION_LABELS[key]}: {sectionStateLabel(rollup.sections[key])}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <Button asChild className="h-11 rounded-xl px-5 max-sm:w-full">
          <Link href={href}>
            Open master checklist
            <ArrowRightIcon aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

function PhaseProgress({ rollup }: { rollup?: ChecklistRollup }) {
  if (!rollup) {
    return <p className="text-muted-foreground text-sm">Checklist progress is unavailable.</p>;
  }
  return (
    <ol className="grid gap-4">
      {SECTION_ORDER.map((key, index) => {
        const section = rollup.sections[key];
        return (
          <li key={key} className="grid gap-1.5">
            <div className="flex items-center gap-2 text-sm">
              <SectionStateIcon section={section} className="size-4 shrink-0" />
              <span className="text-foreground font-medium">{index + 1}. {SECTION_LABELS[key]}</span>
              <span className="text-muted-foreground ml-auto text-xs">{sectionStateLabel(section)}</span>
              <span className="text-foreground w-10 text-right text-xs font-semibold tabular-nums">
                {section.state === 'not_applicable' ? '—' : formatPercent(section.progressPercentage)}
              </span>
            </div>
            <MissionProgress
              value={section.state === 'not_applicable' ? null : section.progressPercentage}
              label={`${SECTION_LABELS[key]} progress`}
              className="h-1.5"
            />
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/* Brief                                                                      */
/* -------------------------------------------------------------------------- */

function TextBlock({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="eyebrow text-muted-foreground">{title}</p>
      <p className="text-foreground mt-1 text-sm whitespace-pre-wrap">{body}</p>
    </div>
  );
}

function SmartGoalTile({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="border-border rounded-xl border bg-white px-3.5 py-3">
      <p className="text-primary text-[11px] font-bold tracking-[0.06em] uppercase">{label}</p>
      <p className={cn('mt-1 text-sm whitespace-pre-wrap', value ? 'text-foreground' : 'text-muted-foreground')}>
        {value ?? '—'}
      </p>
    </div>
  );
}

function Disclosure({
  summary,
  icon: Icon,
  children,
}: {
  summary: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <details className="border-border group rounded-xl border">
      <summary className="text-primary flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold select-none">
        {Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
        {summary}
      </summary>
      <div className="border-border border-t p-4">{children}</div>
    </details>
  );
}

/* -------------------------------------------------------------------------- */
/* Work files                                                                 */
/* -------------------------------------------------------------------------- */

function AssetGroup({
  title,
  links,
  sections,
  empty,
  extraLink,
}: {
  title: string;
  links: readonly TaskLink[];
  sections: readonly TaskDetailSection[];
  empty: string;
  extraLink?: { label: string; href: string };
}) {
  const hasContent = links.length > 0 || sections.length > 0 || extraLink;

  return (
    <div className="grid content-start gap-2">
      <h3 className="eyebrow text-muted-foreground">{title}</h3>
      {hasContent ? (
        <>
          {sections.map((section) => (
            <div key={section.id} className="bg-muted/70 rounded-xl px-3.5 py-2.5">
              <p className="text-foreground text-sm font-medium">{section.title}</p>
              {section.content ? (
                <p className="text-muted-foreground mt-1 text-sm whitespace-pre-wrap">{section.content}</p>
              ) : null}
            </div>
          ))}
          {links.map((link) => (
            <AssetLink key={link.id} link={link} />
          ))}
          {extraLink ? (
            <Link
              href={extraLink.href}
              className="bg-muted/70 hover:bg-primary-subtle flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors"
            >
              <span aria-hidden="true" className="text-primary flex size-8 shrink-0 items-center justify-center rounded-lg bg-white">
                <ListChecksIcon className="size-4" />
              </span>
              <span className="text-primary">{extraLink.label}</span>
            </Link>
          ) : null}
        </>
      ) : (
        <p className="text-muted-foreground text-sm">{empty}</p>
      )}
    </div>
  );
}

const LINK_ICONS: Record<string, LucideIcon> = {
  Folder: FolderIcon,
  Document: FileTextIcon,
  Account: UserIcon,
  Flowchart: PenToolIcon,
  Engineering: PenToolIcon,
  Drawing: PenToolIcon,
  Checklist: ListChecksIcon,
};

function AssetLink({ link }: { link: TaskLink }) {
  const rawHref = link.url ?? link.storagePath;
  const href = rawHref && (/^https?:\/\//i.test(rawHref) || /^\/(team\/|reports#report-)/.test(rawHref)) ? rawHref : null;
  const Icon = LINK_ICONS[link.linkType] ?? LinkIcon;
  const body = (
    <>
      <span aria-hidden="true" className="text-primary flex size-8 shrink-0 items-center justify-center rounded-lg bg-white">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-sm font-medium', href ? 'text-foreground' : 'text-muted-foreground')}>
          {link.label}
        </span>
        <span className="text-muted-foreground block text-xs">{link.linkType}</span>
      </span>
      {href ? <ExternalLinkIcon className="text-muted-foreground size-4 shrink-0" aria-hidden="true" /> : null}
    </>
  );

  if (!href) {
    return <div className="bg-muted/70 flex items-center gap-3 rounded-xl px-3.5 py-2.5">{body}</div>;
  }

  return (
    <a
      href={href}
      className="bg-muted/70 hover:bg-primary-subtle flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition-colors"
      target="_blank"
      rel="noreferrer"
      aria-label={`${link.linkType}: ${link.label}`}
    >
      {body}
    </a>
  );
}

/* -------------------------------------------------------------------------- */
/* Dependencies and activity                                                  */
/* -------------------------------------------------------------------------- */

function DependencyList({
  dependencies,
  taskId,
}: {
  dependencies: readonly TaskDependencyDetail[];
  taskId: string;
}) {
  if (dependencies.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No dependency missions are linked yet.
      </p>
    );
  }

  return (
    <ul className="grid gap-2">
      {dependencies.map(({ dependency, otherTask }) => {
        const direction =
          dependency.predecessorTaskId === taskId ? 'Blocks' : 'Depends on';

        return (
          <li
            key={dependency.id}
            className="bg-muted/70 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-3.5 py-2.5 text-sm"
          >
            <span className="text-muted-foreground font-medium">{direction}</span>
            {otherTask ? (
              <Link
                href={`/tasks/${encodeURIComponent(otherTask.taskTag)}`}
                className="task-tag text-primary hover:underline"
              >
                {otherTask.taskTag}
              </Link>
            ) : (
              <span className="task-tag">Unknown mission</span>
            )}
            {otherTask ? <span className="text-foreground truncate">{otherTask.title}</span> : null}
            <span className="badge-soft badge-neutral">{dependency.relationType}</span>
            {dependency.notes ? (
              <span className="text-muted-foreground basis-full">{dependency.notes}</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function TaskLogTimeline({
  logs,
  memberNames,
}: {
  logs: readonly DailyTaskLog[];
  memberNames: ReadonlyMap<string, string>;
}) {
  if (logs.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No effort has been logged for this mission yet.
      </p>
    );
  }

  return (
    <ol className="grid gap-4">
      {logs.map((log, index) => {
        const name = memberNames.get(log.userId) ?? 'Unknown';
        return (
          <li key={log.id} className="flex gap-3">
            <InitialsAvatar name={name} tone={index} />
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <span className="text-foreground font-semibold">{name}</span>{' '}
                <span className="text-muted-foreground">logged</span>{' '}
                <span className="text-foreground font-semibold tabular-nums">{formatHours(log.hoursWorked)} h</span>
              </p>
              <p className="text-muted-foreground text-xs">
                {formatDate(log.logDate)} · {log.logSource}
              </p>
              {log.updateNotes ? (
                <p className="bg-muted/70 text-foreground mt-2 rounded-xl px-3.5 py-2.5 text-sm whitespace-pre-wrap">
                  {log.updateNotes}
                </p>
              ) : null}
              {log.rawLinks && log.rawLinks.length > 0 ? (
                <p className="mt-1.5 flex flex-wrap gap-3 text-xs">
                  {log.rawLinks.map((rawLink, linkIndex) => (
                    <a
                      key={rawLink}
                      href={rawLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary inline-flex items-center gap-1 font-semibold hover:underline"
                    >
                      <LinkIcon className="size-3" aria-hidden="true" />
                      Link {log.rawLinks!.length > 1 ? linkIndex + 1 : ''}
                    </a>
                  ))}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* -------------------------------------------------------------------------- */
/* Timer and time entry                                                       */
/* -------------------------------------------------------------------------- */

function TimerControl({
  taskTag,
  activeTimer,
  canUseTimer,
}: {
  taskTag: string;
  activeTimer: TaskTimer | null;
  canUseTimer: boolean;
}) {
  if (!canUseTimer) {
    return (
      <p className="text-muted-foreground text-sm">
        Timers are available only for assigned active missions.
      </p>
    );
  }

  if (activeTimer) {
    return (
      <div className="grid gap-3">
        <div className="bg-success-subtle text-success-strong flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm">
          <span aria-hidden="true" className="bg-success size-2 animate-pulse rounded-full" />
          <span>
            Running since{' '}
            <span className="font-semibold">
              {formatDateTime(activeTimer.startedAt)}
            </span>
          </span>
        </div>
        <ExecutionForm action={stopTaskTimer} scope="stopTaskTimer" className="grid gap-2"><input type="hidden" name="expectedVersion" value={activeTimer.executionVersion ?? 0} />
          <input type="hidden" name="timerId" value={activeTimer.id} />
          <label className="grid gap-1 text-sm">
            <span className="text-foreground font-medium">Stop note</span>
            <textarea
              name="notes"
              className={cn(FIELD, 'min-h-20 py-2')}
              placeholder="What did this timer session cover?"
            />
          </label>
          <Button type="submit" className="rounded-xl">
            Stop and log
          </Button>
        </ExecutionForm>
        <ExecutionForm action={discardTaskTimer} scope="discardTaskTimer" className="grid gap-2"><label className="grid gap-1 text-sm"><span className="text-foreground font-medium">Reason</span><input name="reason" required maxLength={1000} className={cn(FIELD, 'h-9')} /></label><input type="hidden" name="expectedVersion" value={activeTimer.executionVersion ?? 0} />
          <input type="hidden" name="timerId" value={activeTimer.id} />
          <input type="hidden" name="taskTag" value={taskTag} />
          <Button type="submit" variant="ghost" size="sm" className="justify-self-start">
            Discard timer
          </Button>
        </ExecutionForm>
      </div>
    );
  }

  return (
    <ExecutionForm action={startTaskTimer} scope="startTaskTimer" className="grid gap-2">
      <input type="hidden" name="taskTag" value={taskTag} />
      <label className="grid gap-1 text-sm">
        <span className="text-foreground font-medium">Start note</span>
        <textarea
          name="notes"
          className={cn(FIELD, 'min-h-20 py-2')}
          placeholder="Optional timer note"
        />
      </label>
      <Button type="submit" className="rounded-xl">
        Start timer
      </Button>
    </ExecutionForm>
  );
}

function TimerRecords({
  timers,
  memberNames,
  taskTag,
  canManage,
  currentUserId,
}: {
  timers: readonly TaskTimer[];
  memberNames: ReadonlyMap<string, string>;
  taskTag: string;
  canManage: boolean;
  currentUserId: string;
}) {
  if (timers.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No timer sessions have been recorded for this mission.
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      {timers.map((timer) => {
        const canManageThisTimer = canManage || timer.userId === currentUserId;

        return (
          <div
            key={timer.id}
            className="bg-muted/70 rounded-xl px-3.5 py-2.5 text-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-foreground font-medium">
                  {memberNames.get(timer.userId) ?? 'Unknown'} · {timer.status}
                </p>
                <p className="text-muted-foreground text-xs">
                  {formatDateTime(timer.startedAt)}
                  {timer.stoppedAt ? ` → ${formatDateTime(timer.stoppedAt)}` : ''}
                </p>
                <p className="text-muted-foreground text-xs tabular-nums">
                  {formatElapsed(timer.elapsedSeconds)}
                  {timer.generatedLogId ? ' · logged' : ''}
                </p>
              </div>
              {timer.status === 'Running' && canManageThisTimer ? (
                <ExecutionForm action={stopTaskTimer} scope="stopTaskTimer"><input type="hidden" name="expectedVersion" value={timer.executionVersion ?? 0} />
                  <input type="hidden" name="timerId" value={timer.id} />
                  <Button type="submit" variant="outline" size="sm">
                    Stop
                  </Button>
                </ExecutionForm>
              ) : null}
            </div>
            {timer.notes ? (
              <p className="text-foreground mt-2 text-xs">{timer.notes}</p>
            ) : null}
            {timer.status === 'Running' && canManageThisTimer ? (
              <ExecutionForm action={discardTaskTimer} scope="discardTaskTimer" className="mt-2 grid gap-2"><label className="grid gap-1 text-sm"><span className="font-medium">Reason</span><input name="reason" required maxLength={1000} className={cn(FIELD, 'h-9')} /></label><input type="hidden" name="expectedVersion" value={timer.executionVersion ?? 0} />
                <input type="hidden" name="timerId" value={timer.id} />
                <input type="hidden" name="taskTag" value={taskTag} />
                <Button type="submit" variant="ghost" size="sm" className="justify-self-start">
                  Discard
                </Button>
              </ExecutionForm>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ManualTimeForm({
  taskTag,
  canUseTimer,
}: {
  taskTag: string;
  canUseTimer: boolean;
}) {
  if (!canUseTimer) {
    return (
      <p className="text-muted-foreground text-sm">
        Manual entries are available only for assigned active missions.
      </p>
    );
  }

  return (
    <ExecutionForm action={enterManualTaskTime} scope="enterManualTaskTime" className="grid gap-2">
      <input type="hidden" name="taskTag" value={taskTag} />
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 grid gap-1 text-sm">
          <span className="text-foreground font-medium">Date</span>
          <input
            type="date"
            name="logDate"
            defaultValue={kolkataDate()}
            className={cn(FIELD, 'h-10')}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-foreground font-medium">Hours</span>
          <input
            type="number"
            name="hoursWorked"
            min={0}
            max={24}
            step="0.25"
            className={cn(FIELD, 'h-10 tabular-nums')}
            required
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-foreground font-medium">Progress added</span>
          <input
            type="number"
            name="progressDelta"
            min={-100}
            max={100}
            step="0.5"
            className={cn(FIELD, 'h-10 tabular-nums')}
            placeholder="0"
          />
        </label>
      </div>
      <label className="grid gap-1 text-sm">
        <span className="text-foreground font-medium">Notes</span>
        <textarea
          name="notes"
          className={cn(FIELD, 'min-h-20 py-2')}
          placeholder="What work was done?"
        />
      </label>
      <Button type="submit" variant="outline" className="rounded-xl">
        Save manual time
      </Button>
    </ExecutionForm>
  );
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function sectionValue(
  sectionsByKey: ReadonlyMap<string, TaskDetailSection>,
  key: string,
): string | null {
  return sectionsByKey.get(key)?.content ?? null;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatElapsed(seconds: number): string {
  if (seconds <= 0) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}
