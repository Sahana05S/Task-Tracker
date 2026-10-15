import { DriveOperations,type DriveReadModel } from '@/components/tasks/drive-operations';
import { TaskToolsOperations } from '@/components/tasks/task-tools-operations';
import Link from 'next/link';
import { NativeTemplateSelect } from '@/components/tasks/native-details-editor';
import { NativeTemplateManager } from '@/components/tasks/native-template-manager';
import { DETAIL_FIELDS,type NativeTemplate } from '@/lib/tasks/details-contract';
import { getNativeTemplates } from '@/lib/tasks/native-details';
import { ExecutionForm } from '@/components/tasks/execution-form';
import { randomUUID } from 'node:crypto';
import { TaskToolsEdit } from '@/components/tasks/task-tools-edit';
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
import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { Button } from '@/components/ui/button';
import { currentPeriod } from '@/lib/analytics/engine';
import { requireProfile } from '@/lib/auth/profile';
import { createClient } from '@/lib/supabase/server';
import { getTaskWorkspaceData } from '@/lib/tasks/queries';
import { canManageTasks } from '@/lib/tasks/permissions';
import {
  canUseWorkbookWorkflow,
  WORKBOOK_WORKFLOWS,
} from '@/lib/task-tools/workflows';
import {
  CHECKLIST_NODE_TYPES,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@/lib/tracker/enums';
import type { Task, User } from '@/types/tracker';

export const metadata: Metadata = {
  title: 'Task Tools · TaskPulse',
};

interface RunningTimer {
  id: string;
  taskId: string;
  userId: string;
  startedAt: string;
  executionVersion: number;
}

export default async function TaskToolsPage() {
  const profile = await requireProfile();
  const canManage = canManageTasks(profile.role);
  const [{ tasks, members }, runningTimers, templates] = await Promise.all([
    getTaskWorkspaceData(),
    getRunningTimers(),
    getNativeTemplates(),
  ]);
  const driveDb=await createClient();
  const driveRead=await driveDb.rpc('drive_read_model',{});
  const driveModel=driveRead.error?null:driveRead.data as unknown as DriveReadModel;
  const period = currentPeriod();

  return (
    <>
      <WorkspaceHeader
        title="Task tools"
        description="Web replacements for the workbook Tasks Tools, Create Work Files, and Report menus"
      />

      <div className="grid gap-4 px-4 py-4 lg:px-6">
        {canManage ? <a href="/task-tools/participants" className="text-sm underline">Review participant reconciliation</a> : null}
        <section className="soft-card p-4">
          <h2 className="text-foreground text-sm font-semibold">
            Workbook menu coverage
          </h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {WORKBOOK_WORKFLOWS.map((workflow) => (
              <div key={workflow.id} className="rounded-md border border-slate-200 bg-white/70 p-3 text-xs font-medium text-slate-700">
                {workflow.label}
                <span className="text-muted-foreground mt-1 block font-normal">
                  {canUseWorkbookWorkflow(profile.role, workflow)
                    ? workflow.status
                    : 'Manager-only'}
                </span>
              </div>
            ))}
          </div>
        </section>

        <DriveOperations tasks={tasks} model={driveModel} canManage={canManage}/>
        <div className="grid gap-4 xl:grid-cols-2">
          <ToolCard title="Task timer">
            <TaskTimerForms tasks={tasks} timers={runningTimers} members={members} />
          </ToolCard>
          <ToolCard title="Task log">
            <TaskLogForm tasks={tasks} />
          </ToolCard>
          <ToolCard title="Task status update">
            <StatusForm tasks={tasks} />
          </ToolCard>
          <ToolCard title="Task operations and tag export">
            <TaskToolsOperations tasks={tasks} members={members} canManage={canManage}/>
          </ToolCard>
          <ToolCard title="Create a new task">
            {canManage ? (
              <TaskCreateForm members={members} templates={templates} />
            ) : (
              <PermissionNote />
            )}
          </ToolCard>
          <ToolCard title="Task details update">
            {canManage ? (
              <TaskDetailsForm tasks={tasks} templates={templates} />
            ) : (
              <PermissionNote />
            )}
          </ToolCard>
          {canManage ? <ToolCard title="Native template versions"><NativeTemplateManager templates={templates}/></ToolCard> : null}
          <ToolCard title="Add existing asset links">
            {canManage ? (
              <WorkFileForm tasks={tasks} />
            ) : (
              <PermissionNote />
            )}
          </ToolCard>
          <ToolCard title="Master checklist updates">
            <ChecklistForms tasks={tasks} canManage={canManage} />
          </ToolCard>
          <ToolCard title="Task edit flow">
            {canManage ? (
              <TaskEditForm tasks={tasks} members={members} />
            ) : (
              <PermissionNote />
            )}
          </ToolCard>
          <ToolCard title="Report generation">
            {canManage ? (
              profile.role === 'managing_director' ? <ReportForms members={members} period={period} /> : <p className="text-sm">Only the managing director can save or close reports.</p>
            ) : (
              <PermissionNote />
            )}
          </ToolCard>
        </div>
      </div>
    </>
  );
}

function ToolCard({
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
      <ExecutionForm action={stopTaskTimer} scope="stopTaskTimer" className="grid gap-2 border-t border-slate-200 pt-3">
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
      <ExecutionForm action={enterManualTaskTime} scope="enterManualTaskTime" className="grid gap-2 border-t border-slate-200 pt-3">
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
      <label>Reason (required for manager cancellation, reset or carryover)<input name="reason" className={inputClass} /></label>
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
 return <div className="grid gap-3"><ExecutionForm action={createTaskDetailsWithFolderAction} scope="initializeDetailsTools"><TaskIdSelect tasks={tasks} name="taskVersion" versioned/><NativeTemplateSelect templates={templates}/><Button type="submit">Initialize native details</Button></ExecutionForm>
 <p className="text-sm">Edit SMART, IPO, relationships and reviewer notes on the task page. Reinitialization preserves content.</p>{tasks.map(t=><Link key={t.id} className="text-sm underline" href={'/tasks/'+encodeURIComponent(t.taskTag)}>{t.taskTag} · {t.title}</Link>)}</div>;
}
function WorkFileForm({tasks}:{tasks:readonly Task[]}) {
 return <ExecutionForm action={createWorkFileLinkAction} scope="saveAssetTools"><TaskIdSelect tasks={tasks} name="taskVersion" versioned/><select name="ipoRole" className={inputClass}>{['input','process','output','reference'].map(r=><option key={r}>{r}</option>)}</select><select name="linkType" className={inputClass}>{['Folder','Document','Account','Flowchart','Engineering','Drawing','Checklist','Raw Link','Other'].map(t=><option key={t}>{t}</option>)}</select><input name="label" required placeholder="Asset label" className={inputClass}/><input name="url" type="url" required placeholder="Existing asset URL" className={inputClass}/><textarea name="notes" className={textareaClass}/><p className="text-sm">This saves a link. Provider work is not requested.</p><Button type="submit">Add existing link</Button></ExecutionForm>;
}

function ChecklistForms({tasks,canManage}:{tasks:readonly Task[];canManage:boolean}) {
 return <div className="grid gap-3"><p>Open a task checklist to review Setup, Activity and Closure, linked tasks and progress ownership.</p>{canManage?<p className="text-sm text-muted-foreground">New checklists start in manual mode. Ownership switches require a reviewed preview and reason.</p>:null}<div className="grid max-h-72 gap-2 overflow-auto">{tasks.map(t=><Link key={t.id} href={`/tasks/${encodeURIComponent(t.taskTag)}/checklist`} className="text-primary underline">{t.taskTag} · {t.title}</Link>)}</div></div>;
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
      <div className="border-t border-slate-200 pt-3"><Link className="underline" href={`/reports?period=${period.startDate.slice(0,7)}`}>Review month archive and close controls</Link></div>
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

async function getRunningTimers(): Promise<RunningTimer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('task_timers')
    .select('id, task_id, user_id, started_at, execution_version')
    .eq('status', 'Running')
    .order('started_at', { ascending: false });

  if (error) throw new Error(`Failed to load running timers: ${error.message}`);
  return data.map((row) => ({
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    startedAt: row.started_at,
    executionVersion: row.execution_version ?? 0,
  }));
}

const inputClass =
  'border-input bg-background h-9 rounded-md border px-3 text-sm';
const textareaClass =
  'border-input bg-background min-h-20 rounded-md border px-3 py-2 text-sm';

type ServerFormAction = (formData: FormData) => void | Promise<void>;

function asFormAction(
  action: (formData: FormData) => Promise<unknown>,
): ServerFormAction {
  return action as ServerFormAction;
}
