import { DETAIL_FIELDS,ipoLinks,sectionsForRole } from '@/lib/tasks/details-contract';
import { NativeDetailsEditor,InitializeDetailsForm } from '@/components/tasks/native-details-editor';
import { getNativeDetailState,getNativeTemplates,getVisibleReportChoices } from '@/lib/tasks/native-details';
import { getTaskWorkspaceData } from '@/lib/tasks/queries';
import { TaskLifecyclePanel } from '@/components/tasks/task-lifecycle-panel';
import { ELIGIBILITY_LABELS,kolkataDate } from '@/lib/tasks/contract';
import { ExecutionForm } from '@/components/tasks/execution-form';
import { TaskReviewForm } from '@/components/tasks/task-review-form';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { Button } from '@/components/ui/button';
import {
  CategoryBadge,
  FreshnessIndicator,
  PriorityBadge,
} from '@/components/tracker/tracker-badges';
import { requireProfile } from '@/lib/auth/profile';
import {
  normalizeTaskTagParam,
  resolveTaskDetailRouteState,
  type TaskDependencyDetail,
} from '@/lib/tasks/detail';
import { canManageTasks } from '@/lib/tasks/permissions';
import { canStartTimerForTask } from '@/lib/timers/permissions';
import { formatDate, formatNumeric, formatPercent, formatHours } from '@/lib/tracker/format';
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
    title: `${normalizedTaskTag ?? 'Task'} · TaskPulse`,
  };
}

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
  const [native,templates,workspace,reports]=await Promise.all([getNativeDetailState(data.task.id),getNativeTemplates(),canManage?getTaskWorkspaceData():Promise.resolve({tasks:[],members:[]}),canManage?getVisibleReportChoices():Promise.resolve([])]);
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

  return (
    <>
      {!archived&&data.task.reviewerIds.includes(currentUser.id) ? <div className="p-4"><TaskReviewForm taskId={data.task.id} version={data.task.lifecycleVersion ?? 0} /></div> : null}
      <WorkspaceHeader
        title={data.task.taskTag}
        description={data.task.title}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/tasks/${encodeURIComponent(data.task.taskTag)}/checklist`}
              className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors"
            >
              Master checklist
            </Link>
            <Link
              href="/tasks"
              className="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex h-9 items-center justify-center rounded-md border px-3 text-sm font-medium transition-colors"
            >
              Back to tasks
            </Link>
          </div>
        }
      />

      <div className="grid gap-4 px-4 py-4 xl:grid-cols-[minmax(0,1fr)_22rem] lg:px-6">
        <main className="grid gap-4">
          {archived?<p className="soft-card p-4" role="status">Archived on {data.task.archivedEffectiveDate}. This task and its retained history are read-only. {data.task.archiveReason}{successor?<Link className="ml-2 underline" href={`/tasks/${encodeURIComponent(successor.taskTag)}`}>Continue on {successor.taskTag} - {successor.title}</Link>:null}</p>:null}
          {canManage ? <TaskLifecyclePanel task={data.task} /> : null}
          <p className="text-sm">Metric eligibility: {data.task.validForMetrics ? "Eligible" : (data.task.eligibilityReasons ?? []).map(reason=>ELIGIBILITY_LABELS[reason] ?? reason).join(", ")}. Hours are required separately for productivity.</p>
          <p className="text-sm">Participant shares: {data.task.participantShares ? Object.entries(data.task.participantShares).map(([id,units])=>`${memberNames.get(id) ?? id}: ${units/10000}%`).join(", ") : "Legacy attribution awaiting reconciliation"}. Completion, criticality and freshness attribution remain undecided for shared work.</p>
          <section className="soft-card grid gap-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="task-tag">{data.task.taskTag}</span>
              <CategoryBadge category={data.task.category} />
              <PriorityBadge priority={data.task.priority} />
              <FreshnessIndicator freshness={data.task.freshness} />
            </div>

            <div>
              <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                Task
              </p>
              <h2 className="text-foreground text-lg font-semibold">
                {data.task.title}
              </h2>
              {sectionValue(sectionsByKey,'description') ? (
                <p className="text-muted-foreground mt-2 text-sm">
                  {data.task.description}
                </p>
              ) : null}
            </div>

            <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Detail
                label="Assignees"
                value={formatNames(assigneeNames, 'Unassigned')}
              />
              <Detail
                label="Reviewers"
                value={formatNames(reviewerNames, 'No reviewer')}
              />
              <Detail label="Status" value={data.task.status} />
              <Detail
                label="Task freshness"
                value={data.task.freshness ?? `Unavailable: ${data.task.freshnessReason ?? "date evidence missing"}`}
              />
              <Detail
                label="Scale"
                value={formatNumeric(data.task.taskScale)}
                numeric
              />
              <Detail
                label="Progress"
                value={formatPercent(data.task.progressPercentage)}
                numeric
              />
              <Detail
                label="Scaled progress"
                value={formatNumeric(data.task.scaledProgress)}
                numeric
              />
              <Detail
                label="Activity checklist progress"
                value={formatPercent(data.checklistProgressPercentage)}
                numeric
              />
              <Detail
                label="Total hours"
                value={formatHours(data.effort.hoursLogged)}
                numeric
              />
              <Detail
                label="Task productivity"
                value={formatNumeric(data.task.taskProductivity)}
                numeric
              />
              <Detail label="Assigned" value={formatDate(data.task.assignedDate)} />
              <Detail label="Due" value={formatDate(data.task.dueDate)} />
              <Detail
                label="Completed"
                value={formatDate(data.task.completedDate)}
              />
              <Detail
                label="Met deadline"
                value={
                  data.task.metDeadline === null
                    ? '—'
                    : data.task.metDeadline
                      ? 'Yes'
                      : 'No'
                }
              />
              <Detail
                label="Metrics eligible"
                value={data.task.validForMetrics ? 'Yes' : 'No'}
              />
              <Detail
                label="Log entries"
                value={String(data.effort.logCount)}
                numeric
              />
            </dl>

            {data.task.comments ? (
              <TextBlock title="Comments" body={data.task.comments} />
            ) : null}
          </section>

          <Panel title="Native task details">
            <p className="text-sm">{native.instance?'Native task/details ready':'Native details not initialized'}</p>
            <p className="text-sm">Provider work: {native.instance?.providerState??'not_requested'}. Automatic Google Drive operations are unavailable; integration is deferred. Existing asset links remain available.</p>
            {native.instance ? <details><summary>Template instructions · {templates.find(t=>t.id===native.instance?.templateVersionId)?.name ?? 'Template'} · version {templates.find(t=>t.id===native.instance?.templateVersionId)?.version}</summary>{DETAIL_FIELDS.map(f=>native.instance?.instructions[f.key]?<p key={f.key}><strong>{f.label}:</strong> {native.instance.instructions[f.key]}</p>:null)}</details> : canManage?<InitializeDetailsForm task={data.task} templates={templates}/>:null}
            {canManage ? <details><summary>Edit structured details and links</summary><NativeDetailsEditor task={data.task} sections={data.sections} tasks={workspace.tasks} members={data.members} reports={reports}/></details>:null}
            {sectionValue(sectionsByKey,'description')?<TextBlock title="Description" body={sectionValue(sectionsByKey,'description')!}/>:null}
            {sectionValue(sectionsByKey,'reviewer_notes')?<TextBlock title="Reviewer notes" body={sectionValue(sectionsByKey,'reviewer_notes')!}/>:null}
            {native.flags.length?<details><summary>Legacy content retained · review required ({native.flags.length})</summary>{native.flags.map(flag=>{const source=data.sections.find(s=>s.id===flag.source_section_id);return <div key={flag.id}><p>{source?.title} · {flag.reason}</p><p className="whitespace-pre-wrap">{source?.content}</p></div>;})}</details>:null}
            {data.links.some(l=>!l.ipoRole)?<p className="text-sm">Legacy links have no confirmed IPO role and are retained here for review.</p>:null}
            {data.links.filter(l=>!l.ipoRole || l.ipoRole==='reference').map(l=><AssetLink key={l.id} link={l}/>)}
          </Panel>

          <section className="grid gap-4 lg:grid-cols-2">
            <Panel title="SMART goal statements">
              <div className="grid gap-2">
                {smartFields.map(f=>f.label).map((label, index) => (
                  <SmartGoalRow
                    key={label}
                    label={label}
                    value={smartGoals[index]}
                  />
                ))}
              </div>
            </Panel>

            <Panel title="Master checklist">
              <div className="grid gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {data.checklist?.title ?? 'No checklist created yet'}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {data.checklist
                      ? `${data.checklistNodes.length} checklist item${data.checklistNodes.length === 1 ? '' : 's'}`
                      : 'Create or attach a master checklist in the checklist module.'}
                  </p>
                </div>
                <progress
                  className="task-progress w-full"
                  value={data.checklistProgressPercentage??undefined}
                  max={100}
                  data-complete={
                    data.checklistProgressPercentage!==null && data.checklistProgressPercentage >= 100 ? 'true' : 'false'
                  }
                  aria-label="Master checklist progress"
                />
                <Link
                  href={`/tasks/${encodeURIComponent(data.task.taskTag)}/checklist`}
                  className="text-primary text-sm font-semibold hover:underline"
                >
                  Open master checklist
                </Link>
              </div>
            </Panel>
          </section>

          <section className="grid gap-4 xl:grid-cols-3">
            <LinkPanel
              title="Inputs"
              empty="No task inputs have been linked."
              links={ipoLinks(data.links,'input')}
              sections={sectionsForRole(data.sections,'input')}
            />
            <LinkPanel
              title="Process"
              empty="No process links have been added."
              links={ipoLinks(data.links,'process')}
              sections={sectionsForRole(data.sections,'process')}
              extraLink={{
                label: 'Master checklist',
                href: `/tasks/${encodeURIComponent(data.task.taskTag)}/checklist`,
              }}
            />
            <LinkPanel
              title="Outputs"
              empty="No task outputs have been linked."
              links={ipoLinks(data.links,'output')}
              sections={sectionsForRole(data.sections,'output')}
            />
          </section>

          <Panel title="Dependency tasks">
            <DependencyList dependencies={data.dependencies} taskId={data.task.id} />
          </Panel>

          <Panel title="Task log">
            <TaskLogTable logs={data.logs} memberNames={memberNames} />
          </Panel>
        </main>

        <aside className="grid h-fit gap-4">
          <Panel title="Task timer">
            <TimerControl
              taskTag={data.task.taskTag}
              activeTimer={activeCurrentTimer}
              canUseTimer={canUseTimer}
            />
          </Panel>

          <Panel title={canManage ? 'Timer records' : 'My timer records'}>
            <TimerRecords
              timers={visibleTimers}
              memberNames={memberNames}
              taskTag={data.task.taskTag}
              canManage={canManage}
              currentUserId={currentUser.id}
            />
          </Panel>

          <Panel title="Manual time entry">
            <ManualTimeForm taskTag={data.task.taskTag} canUseTimer={canUseTimer} />
          </Panel>

          <Panel title="Task details needed">
            <p className="text-muted-foreground text-sm">
              {sectionValue(sectionsByKey, 'task_details_needed') ??
                '[Direct Task]'}
            </p>
          </Panel>

          <Panel title="Updates from master checklist">
            <dl className="grid gap-2">
              <CompactMetric label="Setup status" value={data.checklistRollup?.sections.setup.state.replaceAll('_',' ')??'Unavailable'} />
              <CompactMetric
                label="Closure status"
                value={
                  data.checklistRollup?.sections.closure.state==='not_applicable'?'Not applicable':data.checklistRollup?.sections.closure.isComplete?'Complete':'Pending'
                }
              />
              <CompactMetric
                label="Activity progress"
                value={formatPercent(data.checklistProgressPercentage)}
              />
            </dl>
          </Panel>

          <Panel title="Quick links">
            <div className="grid gap-2 text-sm">
              <Link className="text-primary font-medium hover:underline" href="/dashboard">
                Dashboard
              </Link>
              <Link className="text-primary font-medium hover:underline" href="/tasks">
                Tasks
              </Link>
              <Link
                className="text-primary font-medium hover:underline"
                href={`/tasks/${encodeURIComponent(data.task.taskTag)}/checklist`}
              >
                Master checklist
              </Link>
            </div>
          </Panel>
        </aside>
      </div>
    </>
  );
}

function Detail({
  label,
  value,
  numeric = false,
}: {
  label: string;
  value: string;
  numeric?: boolean;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white/70 p-3">
      <dt className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {label}
      </dt>
      <dd className={numeric ? 'tabular mt-1 text-sm' : 'mt-1 text-sm'}>
        {value}
      </dd>
    </div>
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
      <h3 className="text-foreground text-sm font-semibold">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function TextBlock({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
        {title}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{body}</p>
    </div>
  );
}

function SmartGoalRow({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="grid grid-cols-[7rem_1fr] overflow-hidden rounded-md border border-slate-200 text-sm">
      <span className="bg-muted px-3 py-2 font-semibold text-slate-700">
        {label}
      </span>
      <span className="px-3 py-2 text-slate-700">{value ?? '—'}</span>
    </div>
  );
}

function LinkPanel({
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
    <Panel title={title}>
      {hasContent ? (
        <div className="grid gap-2">
          {sections.map((section) => (
            <div key={section.id} className="rounded-md bg-slate-50 px-3 py-2">
              <p className="text-sm font-medium text-slate-900">
                {section.title}
              </p>
              {section.content ? (
                <p className="text-muted-foreground mt-1 whitespace-pre-wrap text-sm">
                  {section.content}
                </p>
              ) : null}
            </div>
          ))}
          {links.map((link) => (
            <AssetLink key={link.id} link={link} />
          ))}
          {extraLink ? (
            <Link
              href={extraLink.href}
              className="text-primary rounded-md bg-slate-50 px-3 py-2 text-sm font-medium hover:underline"
            >
              {extraLink.label}
            </Link>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{empty}</p>
      )}
    </Panel>
  );
}

function AssetLink({ link }: { link: TaskLink }) {
  const rawHref = link.url ?? link.storagePath;
  const href = rawHref && (/^https?:\/\//i.test(rawHref) || /^\/(team\/|reports#report-)/.test(rawHref)) ? rawHref : null;
  const label = `${link.linkType}: ${link.label}`;

  if (!href) {
    return (
      <div className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
        {label}
      </div>
    );
  }

  return (
    <a
      href={href}
      className="text-primary rounded-md bg-slate-50 px-3 py-2 text-sm font-medium hover:underline"
      target="_blank"
      rel="noreferrer"
    >
      {label}
    </a>
  );
}

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
        No dependency tasks are linked yet.
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
            className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white/70 px-3 py-2 text-sm"
          >
            <span className="text-muted-foreground">{direction}</span>
            {otherTask ? (
              <Link
                href={`/tasks/${encodeURIComponent(otherTask.taskTag)}`}
                className="task-tag hover:underline"
              >
                {otherTask.taskTag}
              </Link>
            ) : (
              <span className="task-tag">Unknown task</span>
            )}
            <span className="text-muted-foreground">
              {dependency.relationType}
            </span>
            {dependency.notes ? (
              <span className="text-slate-700">{dependency.notes}</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function TaskLogTable({
  logs,
  memberNames,
}: {
  logs: readonly DailyTaskLog[];
  memberNames: ReadonlyMap<string, string>;
}) {
  if (logs.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No effort has been logged for this task yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="sheet-grid min-w-[48rem]">
        <thead>
          <tr>
            <th>Date</th>
            <th>Logged by</th>
            <th>Update</th>
            <th className="text-right">Hours</th>
            <th>Source</th>
            <th>Raw links</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id}>
              <td className="text-xs whitespace-nowrap">
                {formatDate(log.logDate)}
              </td>
              <td className="text-xs">
                {memberNames.get(log.userId) ?? 'Unknown'}
              </td>
              <td className="max-w-96 text-xs">
                {log.updateNotes ?? '—'}
              </td>
              <td className="sheet-numeric text-xs">
                {formatHours(log.hoursWorked)}
              </td>
              <td className="text-xs">{log.logSource}</td>
              <td className="text-xs">
                {log.rawLinks && log.rawLinks.length > 0
                  ? log.rawLinks.map((rawLink) => (
                      <a
                        key={rawLink}
                        href={rawLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary mr-2 hover:underline"
                      >
                        Link
                      </a>
                    ))
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
        Timers are available only for assigned active tasks.
      </p>
    );
  }

  if (activeTimer) {
    return (
      <div className="grid gap-3">
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Running since{' '}
          <span className="font-medium">
            {formatDateTime(activeTimer.startedAt)}
          </span>
        </div>
        <ExecutionForm action={stopTaskTimer} scope="stopTaskTimer" className="grid gap-2"><input type="hidden" name="expectedVersion" value={activeTimer.executionVersion ?? 0} />
          <input type="hidden" name="timerId" value={activeTimer.id} />
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-slate-900">Stop note</span>
            <textarea
              name="notes"
              className="border-input bg-background min-h-20 rounded-md border px-3 py-2 text-sm"
              placeholder="What did this timer session cover?"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm">
              Stop and log
            </Button>
          </div>
        </ExecutionForm>
        <ExecutionForm action={discardTaskTimer} scope="discardTaskTimer"><label className="grid gap-1 text-sm">Reason<input name="reason" required maxLength={1000} className="border rounded px-2 py-1" /></label><input type="hidden" name="expectedVersion" value={activeTimer.executionVersion ?? 0} />
          <input type="hidden" name="timerId" value={activeTimer.id} />
          <input type="hidden" name="taskTag" value={taskTag} />
          <Button type="submit" variant="ghost" size="sm">
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
        <span className="font-medium text-slate-900">Start note</span>
        <textarea
          name="notes"
          className="border-input bg-background min-h-20 rounded-md border px-3 py-2 text-sm"
          placeholder="Optional timer note"
        />
      </label>
      <Button type="submit" size="sm">
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
        No timer sessions have been recorded for this task.
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
            className="rounded-md border border-slate-200 bg-white/70 px-3 py-2 text-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-slate-900">
                  {memberNames.get(timer.userId) ?? 'Unknown'} · {timer.status}
                </p>
                <p className="text-muted-foreground text-xs">
                  {formatDateTime(timer.startedAt)}
                  {timer.stoppedAt ? ` → ${formatDateTime(timer.stoppedAt)}` : ''}
                </p>
                <p className="text-muted-foreground text-xs tabular">
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
              <p className="mt-2 text-xs text-slate-700">{timer.notes}</p>
            ) : null}
            {timer.status === 'Running' && canManageThisTimer ? (
              <ExecutionForm action={discardTaskTimer} scope="discardTaskTimer" className="mt-2"><label className="grid gap-1 text-sm">Reason<input name="reason" required maxLength={1000} className="border rounded px-2 py-1" /></label><input type="hidden" name="expectedVersion" value={timer.executionVersion ?? 0} />
                <input type="hidden" name="timerId" value={timer.id} />
                <input type="hidden" name="taskTag" value={taskTag} />
                <Button type="submit" variant="ghost" size="sm">
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
        Manual entries are available only for assigned active tasks.
      </p>
    );
  }

  return (
    <ExecutionForm action={enterManualTaskTime} scope="enterManualTaskTime" className="grid gap-2">
      <input type="hidden" name="taskTag" value={taskTag} />
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-900">Date</span>
        <input
          type="date"
          name="logDate"
          defaultValue={kolkataDate()}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-900">Hours</span>
        <input
          type="number"
          name="hoursWorked"
          min={0}
          max={24}
          step="0.25"
          className="border-input bg-background h-9 rounded-md border px-3 text-sm tabular"
          required
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-900">Progress added</span>
        <input
          type="number"
          name="progressDelta"
          min={-100}
          max={100}
          step="0.5"
          className="border-input bg-background h-9 rounded-md border px-3 text-sm tabular"
          placeholder="0"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-900">Notes</span>
        <textarea
          name="notes"
          className="border-input bg-background min-h-20 rounded-md border px-3 py-2 text-sm"
          placeholder="What work was done?"
        />
      </label>
      <Button type="submit" size="sm">
        Save manual time
      </Button>
    </ExecutionForm>
  );
}

function CompactMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function sectionValue(
  sectionsByKey: ReadonlyMap<string, TaskDetailSection>,
  key: string,
): string | null {
  return sectionsByKey.get(key)?.content ?? null;
}


function formatNames(names: readonly string[], fallback: string): string {
  return names.length > 0 ? names.join(', ') : fallback;
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

type ServerFormAction = (formData: FormData) => void | Promise<void>;

function asFormAction(
  action: (formData: FormData) => Promise<unknown>,
): ServerFormAction {
  return action as ServerFormAction;
}
