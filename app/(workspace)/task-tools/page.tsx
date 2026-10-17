import { DriveOperations } from '@/modules/drive/components/drive-operations';
import { TaskToolsOperations } from '@/modules/tasks/components/task-tools-operations';
import Link from 'next/link';
import { NativeTemplateSelect } from '@/modules/tasks/components/native-details-editor';
import { NativeTemplateManager } from '@/modules/tasks/components/native-template-manager';
import { DETAIL_FIELDS, type NativeTemplate } from '@/modules/tasks';
import { getNativeTemplates } from '@/modules/tasks';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { randomUUID } from 'node:crypto';
import { TaskToolsEdit } from '@/modules/tasks/components/task-tools-edit';
import type { Metadata } from 'next';

import {
  createTaskDetailsWithFolderAction,
  createTaskFromTools,
  createTaskLogFromTools,
  createWorkFileLinkAction,
  generateReportFromToolsAction,
  renameTaskFolderLinkAction,
  updateTaskDetailsAction,
  updateTaskFromTools,
  updateTaskStatusFromTools,
} from '@/app/(workspace)/task-tools/actions';
import {
  enterManualTaskTime,
  startTaskTimer,
  stopTaskTimer,
} from '@/app/(workspace)/tasks/[taskTag]/timer-actions';
import {
  ClipboardEditIcon,
  FileBarChartIcon,
  FilePlusIcon,
  LayersIcon,
  LinkIcon,
  ListChecksIcon,
  ListTodoIcon,
  NotebookPenIcon,
  PencilIcon,
  RefreshCwIcon,
  TimerIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react';

import { MissionPage, MissionPageHeader, MissionPanel } from '@/components/missions/mission-ui';
import { Button } from '@/shared/ui/button';
import { currentPeriod } from '@/lib/analytics/engine';
import { requireProfile } from '@/shared/session/profile';
import { getTeamRunningTimers, type TeamRunningTimer } from '@/lib/timers/queries';
import { getDriveReadModel } from '@/modules/drive';
import { getTaskWorkspaceData } from '@/modules/tasks';
import { canManageTasks } from '@/modules/tasks';
import { canUseWorkbookWorkflow, WORKBOOK_WORKFLOWS } from '@/modules/tasks';
import {
  CHECKLIST_NODE_TYPES,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@/shared/tracker/enums';
import type { Task, User } from '@/types/tracker';

export const metadata: Metadata = {
  title: 'Task Tools · TaskPulse',
};

type RunningTimer = TeamRunningTimer;

export default async function TaskToolsPage() {
  const profile = await requireProfile();
  const canManage = canManageTasks(profile.role);
  const [{ tasks, members }, runningTimers, templates] = await Promise.all([
    getTaskWorkspaceData(),
    getTeamRunningTimers(),
    getNativeTemplates(),
  ]);
  const driveModel = await getDriveReadModel();
  const period = currentPeriod();

  return (
    <MissionPage>
      <MissionPageHeader
        eyebrow="Missions"
        title="Task Tools"
        description="Web replacements for the workbook Tasks Tools, Create Work Files, and Report menus"
        actions={canManage ? <a href="/task-tools/participants" className="button-secondary gap-2"><UsersIcon className="size-4" aria-hidden="true" />Review participant reconciliation</a> : null}
      />

      <MissionPanel icon={ListTodoIcon} title="Workbook menu coverage">
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-4">
          {WORKBOOK_WORKFLOWS.map((workflow) => (
            <div key={workflow.id} className="bg-muted/70 text-foreground rounded-xl px-3.5 py-3 text-xs font-semibold">
              {workflow.label}
              <span className="text-muted-foreground mt-1 block font-normal">
                {canUseWorkbookWorkflow(profile.role, workflow)
                  ? workflow.status
                  : 'Manager-only'}
              </span>
            </div>
          ))}
        </div>
      </MissionPanel>

      <DriveOperations tasks={tasks} model={driveModel} canManage={canManage}/>
      <div className="grid gap-5 lg:gap-6 xl:grid-cols-2">
        <ToolCard title="Task timer" icon={TimerIcon}>
          <TaskTimerForms tasks={tasks} timers={runningTimers} members={members} />
        </ToolCard>
        <ToolCard title="Task log" icon={NotebookPenIcon}>
          <TaskLogForm tasks={tasks} />
        </ToolCard>
        <ToolCard title="Task status update" icon={RefreshCwIcon}>
          <StatusForm tasks={tasks} />
        </ToolCard>
        <ToolCard title="Task operations and tag export" icon={LayersIcon}>
          <TaskToolsOperations tasks={tasks} members={members} canManage={canManage}/>
        </ToolCard>
        <ToolCard title="Create a new task" icon={FilePlusIcon}>
          {canManage ? (
            <TaskCreateForm members={members} templates={templates} />
          ) : (
            <PermissionNote />
          )}
        </ToolCard>
        <ToolCard title="Task details update" icon={ClipboardEditIcon}>
          {canManage ? (
            <TaskDetailsForm tasks={tasks} templates={templates} />
          ) : (
            <PermissionNote />
          )}
        </ToolCard>
        {canManage ? <ToolCard title="Native template versions" icon={ListTodoIcon}><NativeTemplateManager templates={templates}/></ToolCard> : null}
        <ToolCard title="Add existing asset links" icon={LinkIcon}>
          {canManage ? (
            <WorkFileForm tasks={tasks} />
          ) : (
            <PermissionNote />
          )}
        </ToolCard>
        <ToolCard title="Master checklist updates" icon={ListChecksIcon}>
          <ChecklistForms tasks={tasks} canManage={canManage} />
        </ToolCard>
        <ToolCard title="Task edit flow" icon={PencilIcon}>
          {canManage ? (
            <TaskEditForm tasks={tasks} members={members} />
          ) : (
            <PermissionNote />
          )}
        </ToolCard>
        <ToolCard title="Report generation" icon={FileBarChartIcon}>
          {canManage ? (
            profile.role === 'managing_director' ? <ReportForms members={members} period={period} /> : <p className="text-muted-foreground text-sm">Only the managing director can save or close reports.</p>
          ) : (
            <PermissionNote />
          )}
        </ToolCard>
      </div>
    </MissionPage>
  );
}

function ToolCard({
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

function TaskTimerForms({
  tasks,
  timers,
  members,
}: {
  tasks: readonly Task[];
  timers: readonly RunningTimer[];
  members: readonly User[];
}) {
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const membersById = new Map(members.map((member) => [member.id, member]));

  return (
    <div className="grid gap-3">
      <ExecutionForm action={startTaskTimer} scope="startTaskTimer" className="grid gap-2">
        <TaskTagSelect tasks={tasks} name="taskTag" />
        <input name="notes" className={inputClass} placeholder="Timer note, optional" />
        <Button type="submit" size="sm">Run timer</Button>
      </ExecutionForm>
      <ExecutionForm action={stopTaskTimer} scope="stopTaskTimer" className="border-border grid gap-2 border-t pt-3">
        <select name="timerId" className={inputClass} required>
          <option value="">Select running timer</option>
          {timers.map((timer) => {
            const task = tasksById.get(timer.taskId);
            const member = membersById.get(timer.userId);
            return (
              <option key={timer.id} value={`${timer.id}:${timer.executionVersion}`}>
                {task?.taskTag ?? 'Unknown task'} · {member?.fullName ?? 'Unknown'} · {new Date(timer.startedAt).toLocaleString()}
              </option>
            );
          })}
        </select>
        <input name="notes" className={inputClass} placeholder="Stop note, optional" />
        <Button type="submit" size="sm" variant="outline">Stop timer</Button>
      </ExecutionForm>
      <ExecutionForm action={enterManualTaskTime} scope="enterManualTaskTime" className="border-border grid gap-2 border-t pt-3">
        <TaskTagSelect tasks={tasks} name="taskTag" />
        <input type="date" name="logDate" className={inputClass} required />
        <input type="number" step="0.25" min="0" max="24" name="hoursWorked" className={inputClass} placeholder="Hours worked" required />
        <input type="number" step="1" name="progressDelta" className={inputClass} placeholder="Progress added %" />
        <input name="notes" className={inputClass} placeholder="Manual time note" />
        <Button type="submit" size="sm" variant="accent">Enter time</Button>
      </ExecutionForm>
    </div>
  );
}

function TaskLogForm({ tasks }: { tasks: readonly Task[] }) {
  return (
    <ExecutionForm action={createTaskLogFromTools} scope="createTaskLogFromTools" className="grid gap-2">
      <TaskIdSelect tasks={tasks} name="taskId" />
      <input type="date" name="logDate" className={inputClass} required />
      <input type="number" step="0.25" min="0" max="24" name="hoursWorked" className={inputClass} placeholder="Hours worked" required />
      <input type="number" step="1" name="progressDelta" className={inputClass} placeholder="Progress added %" />
      <textarea name="updateNotes" className={textareaClass} placeholder="Task update" />
      <input name="rawLinks" className={inputClass} placeholder="Raw link URL, optional" />
      <Button type="submit" size="sm">Save task log</Button>
    </ExecutionForm>
  );
}

function StatusForm({ tasks }: { tasks: readonly Task[] }) {
  return (
    <ExecutionForm action={updateTaskStatusFromTools} scope="transition" className="grid gap-2">
      <select name="taskVersion" className={inputClass} required>{tasks.map(task=><option key={task.id} value={`${task.id}:${task.lifecycleVersion ?? 0}`}>{task.taskTag} · {task.title}</option>)}</select>
      <select name="status" className={inputClass} required>
        {TASK_STATUSES.map((status) => (
          <option key={status} value={status}>{status}</option>
        ))}
      </select>
      <label className="field-label">Reason (required for manager cancellation, reset or carryover)<input name="reason" className={inputClass} /></label>
      <Button type="submit" size="sm">Update status</Button>
    </ExecutionForm>
  );
}

function TaskCreateForm({ members,templates }: { members: readonly User[];templates:readonly NativeTemplate[] }) {
  return (
    <ExecutionForm action={createTaskFromTools} scope="createTaskTools" className="grid gap-2">
      <input type="hidden" name="operationId" value={randomUUID()} />
      <input name="taskTag" className={inputClass} placeholder="Task tag" required />
      <input name="title" className={inputClass} placeholder="Task title" required />
      <TaxonomySelect name="category" values={TASK_CATEGORIES} />
      <TaxonomySelect name="priority" values={TASK_PRIORITIES} />
      <MemberSelect members={members} name="assigneeIds" label="Assignees" multiple />
      <MemberSelect members={members} name="reviewerIds" label="Reviewers" optional multiple />
      <input type="date" name="dueDate" className={inputClass} />
      <input type="number" step="0.01" min="0" name="taskScale" className={inputClass} placeholder="Task scale" />
      <NativeTemplateSelect templates={templates}/>
      <select name="initializationMode" className={inputClass}><option value="automatic">Initialize automatically after saving</option><option value="manual">Initialize manually later</option></select>
      <textarea name="description" className={textareaClass} placeholder="Description"/>
      <Button type="submit" size="sm">Create task</Button>
    </ExecutionForm>
  );
}

function TaskEditForm({ tasks, members }: { tasks: readonly Task[]; members: readonly User[] }) {
  return <TaskToolsEdit tasks={tasks} members={members} />;
}

function TaskDetailsForm({tasks,templates}:{tasks:readonly Task[];templates:readonly NativeTemplate[]}) {
 return <div className="grid gap-3"><ExecutionForm action={createTaskDetailsWithFolderAction} scope="initializeDetailsTools" className="grid gap-2"><TaskIdSelect tasks={tasks} name="taskVersion" versioned/><NativeTemplateSelect templates={templates}/><Button type="submit">Initialize native details</Button></ExecutionForm>
 <p className="text-muted-foreground text-sm">Edit SMART, IPO, relationships and reviewer notes on the mission page. Reinitialization preserves content.</p><div className="grid max-h-72 gap-1.5 overflow-auto">{tasks.map(t=><Link key={t.id} className="link text-sm" href={'/tasks/'+encodeURIComponent(t.taskTag)}>{t.taskTag} · {t.title}</Link>)}</div></div>;
}
function WorkFileForm({tasks}:{tasks:readonly Task[]}) {
 return <ExecutionForm action={createWorkFileLinkAction} scope="saveAssetTools" className="grid gap-2"><TaskIdSelect tasks={tasks} name="taskVersion" versioned/><select name="ipoRole" className={inputClass}>{['input','process','output','reference'].map(r=><option key={r}>{r}</option>)}</select><select name="linkType" className={inputClass}>{['Folder','Document','Account','Flowchart','Engineering','Drawing','Checklist','Raw Link','Other'].map(t=><option key={t}>{t}</option>)}</select><input name="label" required placeholder="Asset label" className={inputClass}/><input name="url" type="url" required placeholder="Existing asset URL" className={inputClass}/><textarea name="notes" className={textareaClass}/><p className="text-muted-foreground text-sm">This saves a link. Provider work is not requested.</p><Button type="submit">Add existing link</Button></ExecutionForm>;
}

function ChecklistForms({tasks,canManage}:{tasks:readonly Task[];canManage:boolean}) {
 return <div className="grid gap-3"><p className="text-sm">Open a mission checklist to review Setup, Activity and Closure, linked missions and progress ownership.</p>{canManage?<p className="text-sm text-muted-foreground">New checklists start in manual mode. Ownership switches require a reviewed preview and reason.</p>:null}<div className="grid max-h-72 gap-2 overflow-auto">{tasks.map(t=><Link key={t.id} href={`/tasks/${encodeURIComponent(t.taskTag)}/checklist`} className="link text-sm">{t.taskTag} · {t.title}</Link>)}</div></div>;
}

function ReportForms({
  members,
  period,
}: {
  members: readonly User[];
  period: ReturnType<typeof currentPeriod>;
}) {
  return (
    <div className="grid gap-3">
      <form action={asFormAction(generateReportFromToolsAction)} className="grid gap-2">
        <input name="title" className={inputClass} defaultValue={`${period.label} Task Report`} />
        <input name="reportType" className={inputClass} defaultValue="Task Tools Report" />
        <div className="grid grid-cols-2 gap-2">
          <input type="number" name="year" className={inputClass} defaultValue={period.year} />
          <input type="number" name="month" className={inputClass} min="1" max="12" defaultValue={period.month} />
        </div>
        <MemberSelect members={members} name="employeeId" label="Employee report target" optional />
        <Button type="submit" size="sm">Generate report snapshot</Button>
      </form>
      <div className="border-border border-t pt-3"><Link className="link" href={`/reports?period=${period.startDate.slice(0,7)}`}>Review month archive and close controls</Link></div>
    </div>
  );
}

function TaskIdSelect({ tasks, name,versioned=false }: { tasks: readonly Task[]; name: string;versioned?:boolean }) {
  return (
    <select name={name} className={inputClass} required>
      <option value="">Select task</option>
      {tasks.filter(task=>!task.archivedEffectiveDate).map((task) => (
        <option key={task.id} value={versioned?`${task.id}:${task.lifecycleVersion??0}`:task.id}>{task.taskTag} · {task.title}</option>
      ))}
    </select>
  );
}

function TaskTagSelect({ tasks, name }: { tasks: readonly Task[]; name: string }) {
  return (
    <select name={name} className={inputClass} required>
      <option value="">Select task</option>
      {tasks.filter(task=>!task.archivedEffectiveDate).map((task) => (
        <option key={task.id} value={task.taskTag}>{task.taskTag} · {task.title}</option>
      ))}
    </select>
  );
}

function MemberSelect({
  members,
  name,
  label,
  optional = false,
  multiple = false,
}: {
  members: readonly User[];
  name: string;
  label: string;
  optional?: boolean;
  multiple?: boolean;
}) {
  return (
    <select
      name={name}
      className={multiple ? `${inputClass} h-24` : inputClass}
      required={!optional}
      multiple={multiple}
      aria-label={label}
    >
      {!multiple ? (
        <option value="">{optional ? `No ${label.toLowerCase()}` : label}</option>
      ) : null}
      {members.map((member) => (
        <option key={member.id} value={member.id}>{member.fullName} · {member.employeeId}</option>
      ))}
    </select>
  );
}

function TaxonomySelect<T extends string>({ name, values }: { name: string; values: readonly T[] }) {
  return (
    <select name={name} className={inputClass} required>
      {values.map((value) => <option key={value} value={value}>{value}</option>)}
    </select>
  );
}

function PermissionNote() {
  return (
    <p className="text-muted-foreground text-sm">
      This workbook workflow is manager-only.
    </p>
  );
}

const inputClass = 'field';
const textareaClass = 'field min-h-20';

type ServerFormAction = (formData: FormData) => void | Promise<void>;

function asFormAction(
  action: (formData: FormData) => Promise<unknown>,
): ServerFormAction {
  return action as ServerFormAction;
}
