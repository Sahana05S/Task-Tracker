import type { Metadata } from 'next';

import {
  addChecklistNodeFromTools,
  createMasterChecklistFromTools,
  createSplitSupportTaskAction,
  createSupportTaskAction,
  createTaskDetailsWithFolderAction,
  createTaskFromTools,
  createTaskLogFromTools,
  createWorkFileLinkAction,
  duplicateTaskAction,
  freezeMonthlySnapshotFromTools,
  generateReportFromToolsAction,
  refreshTaskMetricsAction,
  renameTaskFolderLinkAction,
  setChecklistProgressSyncFromTools,
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
}

export default async function TaskToolsPage() {
  const profile = await requireProfile();
  const canManage = canManageTasks(profile.role);
  const [{ tasks, members }, runningTimers] = await Promise.all([
    getTaskWorkspaceData(),
    getRunningTimers(),
  ]);
  const period = currentPeriod();

  return (
    <>
      <WorkspaceHeader
        title="Task tools"
        description="Web replacements for the workbook Tasks Tools, Create Work Files, and Report menus"
      />

      <div className="grid gap-4 px-4 py-4 lg:px-6">
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
                    ? 'Available'
                    : 'Manager-only'}
                </span>
              </div>
            ))}
          </div>
        </section>

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
          <ToolCard title="Refresh metrics">
            <RefreshMetricsForm tasks={tasks} />
          </ToolCard>
          <ToolCard title="Task import / create flow">
            {canManage ? (
              <TaskCreateForm members={members} />
            ) : (
              <PermissionNote />
            )}
          </ToolCard>
          <ToolCard title="Task details update">
            {canManage ? (
              <TaskDetailsForm tasks={tasks} />
            ) : (
              <PermissionNote />
            )}
          </ToolCard>
          <ToolCard title="Create work files">
            {canManage ? (
              <WorkFileForm tasks={tasks} />
            ) : (
              <PermissionNote />
            )}
          </ToolCard>
          <ToolCard title="Task duplication">
            {canManage ? (
              <DuplicateTaskForm tasks={tasks} />
            ) : (
              <PermissionNote />
            )}
          </ToolCard>
          <ToolCard title="Support task creation">
            {canManage ? (
              <SupportTaskForms tasks={tasks} members={members} />
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
              <ReportForms members={members} period={period} />
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
      <form action={asFormAction(startTaskTimer)} className="grid gap-2">
        <TaskTagSelect tasks={tasks} name="taskTag" />
        <input name="notes" className={inputClass} placeholder="Timer note, optional" />
        <Button type="submit" size="sm">Run timer</Button>
      </form>
      <form action={asFormAction(stopTaskTimer)} className="grid gap-2 border-t border-slate-200 pt-3">
        <select name="timerId" className={inputClass} required>
          <option value="">Select running timer</option>
          {timers.map((timer) => {
            const task = tasksById.get(timer.taskId);
            const member = membersById.get(timer.userId);
            return (
              <option key={timer.id} value={timer.id}>
                {task?.taskTag ?? 'Unknown task'} · {member?.fullName ?? 'Unknown'} · {new Date(timer.startedAt).toLocaleString()}
              </option>
            );
          })}
        </select>
        <input name="notes" className={inputClass} placeholder="Stop note, optional" />
        <Button type="submit" size="sm" variant="outline">Stop timer</Button>
      </form>
      <form action={asFormAction(enterManualTaskTime)} className="grid gap-2 border-t border-slate-200 pt-3">
        <TaskTagSelect tasks={tasks} name="taskTag" />
        <input type="date" name="logDate" className={inputClass} />
        <input type="number" step="0.25" min="0" max="24" name="hoursWorked" className={inputClass} placeholder="Hours worked" required />
        <input type="number" step="1" name="progressDelta" className={inputClass} placeholder="Progress added %" />
        <input name="notes" className={inputClass} placeholder="Manual time note" />
        <Button type="submit" size="sm" variant="accent">Enter time</Button>
      </form>
    </div>
  );
}

function TaskLogForm({ tasks }: { tasks: readonly Task[] }) {
  return (
    <form action={asFormAction(createTaskLogFromTools)} className="grid gap-2">
      <TaskIdSelect tasks={tasks} name="taskId" />
      <input type="date" name="logDate" className={inputClass} />
      <input type="number" step="0.25" min="0" max="24" name="hoursWorked" className={inputClass} placeholder="Hours worked" required />
      <input type="number" step="1" name="progressDelta" className={inputClass} placeholder="Progress added %" />
      <textarea name="updateNotes" className={textareaClass} placeholder="Task update" />
      <input name="rawLinks" className={inputClass} placeholder="Raw link URL, optional" />
      <Button type="submit" size="sm">Save task log</Button>
    </form>
  );
}

function StatusForm({ tasks }: { tasks: readonly Task[] }) {
  return (
    <form action={asFormAction(updateTaskStatusFromTools)} className="grid gap-2">
      <TaskIdSelect tasks={tasks} name="taskId" />
      <select name="status" className={inputClass} required>
        {TASK_STATUSES.map((status) => (
          <option key={status} value={status}>{status}</option>
        ))}
      </select>
      <Button type="submit" size="sm">Update status</Button>
    </form>
  );
}

function RefreshMetricsForm({ tasks }: { tasks: readonly Task[] }) {
  return (
    <form action={asFormAction(refreshTaskMetricsAction)} className="grid gap-2">
      <TaskIdSelect tasks={tasks} name="taskId" />
      <Button type="submit" size="sm" variant="outline">Refresh task metrics</Button>
    </form>
  );
}

function TaskCreateForm({ members }: { members: readonly User[] }) {
  return (
    <form action={asFormAction(createTaskFromTools)} className="grid gap-2">
      <input name="taskTag" className={inputClass} placeholder="Task tag" required />
      <input name="title" className={inputClass} placeholder="Task title" required />
      <TaxonomySelect name="category" values={TASK_CATEGORIES} />
      <TaxonomySelect name="priority" values={TASK_PRIORITIES} />
      <MemberSelect members={members} name="assigneeIds" label="Assignees" multiple />
      <MemberSelect members={members} name="reviewerIds" label="Reviewers" optional multiple />
      <input type="date" name="dueDate" className={inputClass} />
      <input type="number" step="0.01" min="0" name="taskScale" className={inputClass} placeholder="Task scale" />
      <Button type="submit" size="sm">Create task</Button>
    </form>
  );
}

function TaskEditForm({ tasks, members }: { tasks: readonly Task[]; members: readonly User[] }) {
  return (
    <form action={asFormAction(updateTaskFromTools)} className="grid gap-2">
      <TaskIdSelect tasks={tasks} name="taskId" />
      <input name="taskTag" className={inputClass} placeholder="New task tag" required />
      <input name="title" className={inputClass} placeholder="New title" required />
      <TaxonomySelect name="category" values={TASK_CATEGORIES} />
      <TaxonomySelect name="priority" values={TASK_PRIORITIES} />
      <MemberSelect members={members} name="assigneeIds" label="Assignees" multiple />
      <MemberSelect members={members} name="reviewerIds" label="Reviewers" optional multiple />
      <input type="date" name="dueDate" className={inputClass} />
      <input type="number" step="0.01" min="0" name="taskScale" className={inputClass} placeholder="Task scale" />
      <Button type="submit" size="sm">Update task details</Button>
    </form>
  );
}

function TaskDetailsForm({ tasks }: { tasks: readonly Task[] }) {
  return (
    <div className="grid gap-3">
      <form action={asFormAction(createTaskDetailsWithFolderAction)} className="grid gap-2">
        <TaskIdSelect tasks={tasks} name="taskId" />
        <input name="folderUrl" type="url" className={inputClass} placeholder="Task folder URL, optional" />
        <input name="masterChecklistUrl" type="url" className={inputClass} placeholder="Master checklist URL, optional" />
        <input name="carryoverTaskTag" className={inputClass} placeholder="Carryover task tag, optional" />
        <Button type="submit" size="sm">Create task details page</Button>
      </form>
      <form action={asFormAction(updateTaskDetailsAction)} className="grid gap-2 border-t border-slate-200 pt-3">
        <TaskIdSelect tasks={tasks} name="taskId" />
        <input name="keyName" className={inputClass} placeholder="Section key, e.g. smart-goals" required />
        <input name="title" className={inputClass} placeholder="Section title" required />
        <textarea name="content" className={textareaClass} placeholder="Details content" />
        <Button type="submit" size="sm" variant="outline">Save details</Button>
      </form>
      <form action={asFormAction(renameTaskFolderLinkAction)} className="grid gap-2 border-t border-slate-200 pt-3">
        <TaskIdSelect tasks={tasks} name="taskId" />
        <input name="taskTitle" className={inputClass} placeholder="Folder title replacement" required />
        <Button type="submit" size="sm" variant="accent">Rename task folder link</Button>
      </form>
    </div>
  );
}

function WorkFileForm({ tasks }: { tasks: readonly Task[] }) {
  return (
    <form action={asFormAction(createWorkFileLinkAction)} className="grid gap-2">
      <TaskIdSelect tasks={tasks} name="taskId" />
      <select name="linkType" className={inputClass}>
        {['Folder', 'Document', 'Account', 'Flowchart', 'Engineering', 'Drawing', 'Checklist', 'Raw Link', 'Other'].map((type) => (
          <option key={type} value={type}>{type}</option>
        ))}
      </select>
      <input name="label" className={inputClass} placeholder="Work file label" required />
      <input name="url" type="url" className={inputClass} placeholder="Folder or asset URL" required />
      <textarea name="notes" className={textareaClass} placeholder="Notes" />
      <Button type="submit" size="sm">Create work-file link</Button>
    </form>
  );
}

function DuplicateTaskForm({ tasks }: { tasks: readonly Task[] }) {
  return (
    <form action={asFormAction(duplicateTaskAction)} className="grid gap-2">
      <TaskIdSelect tasks={tasks} name="sourceTaskId" />
      <input name="newTaskTag" className={inputClass} placeholder="New global task tag" required />
      <input name="title" className={inputClass} placeholder="New title, optional" />
      <Button type="submit" size="sm">Duplicate task</Button>
    </form>
  );
}

function SupportTaskForms({ tasks, members }: { tasks: readonly Task[]; members: readonly User[] }) {
  return (
    <div className="grid gap-3">
      <form action={asFormAction(createSupportTaskAction)} className="grid gap-2">
        <TaskIdSelect tasks={tasks} name="parentTaskId" />
        <input name="taskTag" className={inputClass} placeholder="Support task tag" required />
        <input name="title" className={inputClass} placeholder="Support task title" required />
        <TaxonomySelect name="category" values={TASK_CATEGORIES} />
        <TaxonomySelect name="priority" values={TASK_PRIORITIES} />
        <MemberSelect members={members} name="assigneeId" label="Assignee" />
        <MemberSelect members={members} name="reviewerId" label="Reviewer" optional />
        <input type="date" name="dueDate" className={inputClass} />
        <input type="number" step="0.01" min="0" name="taskScale" className={inputClass} placeholder="Task scale" />
        <textarea name="description" className={textareaClass} placeholder="Description" />
        <textarea name="notes" className={textareaClass} placeholder="Support relation notes" />
        <Button type="submit" size="sm">Create support task</Button>
      </form>
      <form action={asFormAction(createSplitSupportTaskAction)} className="grid gap-2 border-t border-slate-200 pt-3">
        <TaskIdSelect tasks={tasks} name="sourceTaskId" />
        <div className="grid grid-cols-2 gap-2">
          <select name="supportKind" className={inputClass}>
            <option value="effort">Effort Support</option>
            <option value="skill">Skill Support</option>
          </select>
          <select name="splitMode" className={inputClass}>
            <option value="split-even">Split Even</option>
            <option value="split-uneven">Split Uneven</option>
            <option value="proportional">Proportional Support</option>
            <option value="absolute">Absolute Scale Support</option>
          </select>
        </div>
        <input name="taskTag" className={inputClass} placeholder="New support task tag" required />
        <input name="title" className={inputClass} placeholder="Support title, optional" />
        <MemberSelect members={members} name="assigneeId" label="Support assignee" />
        <MemberSelect members={members} name="reviewerId" label="Reviewer override" optional />
        <div className="grid grid-cols-2 gap-2">
          <input type="number" step="0.01" min="0" name="splitAmount" className={inputClass} placeholder="Scale for uneven/absolute" />
          <input type="number" step="1" min="0" max="100" name="splitPercentage" className={inputClass} placeholder="% for proportional" />
        </div>
        <Button type="submit" size="sm" variant="accent">Create split support task</Button>
      </form>
    </div>
  );
}

function ChecklistForms({ tasks, canManage }: { tasks: readonly Task[]; canManage: boolean }) {
  return (
    <div className="grid gap-3">
      <form action={asFormAction(createMasterChecklistFromTools)} className="grid gap-2">
        <TaskTagSelect tasks={tasks} name="taskTag" />
        <input name="title" className={inputClass} placeholder="Checklist title" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="syncProgressToTask" defaultChecked />
          Sync progress to task
        </label>
        <Button type="submit" size="sm">Create master checklist</Button>
      </form>
      {canManage ? (
        <>
          <form action={asFormAction(addChecklistNodeFromTools)} className="grid gap-2 border-t border-slate-200 pt-3">
            <TaskTagSelect tasks={tasks} name="taskTag" />
            <input name="checklistId" className={inputClass} placeholder="Checklist UUID" required />
            <input name="parentNodeId" className={inputClass} placeholder="Parent node UUID, optional" />
            <select name="nodeType" className={inputClass}>
              {CHECKLIST_NODE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <input name="title" className={inputClass} placeholder="Checklist item title" required />
            <input name="linkedTaskTag" className={inputClass} placeholder="Linked task tag for Task nodes" />
            <textarea name="description" className={textareaClass} placeholder="Description" />
            <Button type="submit" size="sm" variant="outline">Add checklist node</Button>
          </form>
          <form action={asFormAction(setChecklistProgressSyncFromTools)} className="grid gap-2 border-t border-slate-200 pt-3">
            <TaskTagSelect tasks={tasks} name="taskTag" />
            <input name="checklistId" className={inputClass} placeholder="Checklist UUID" required />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="syncProgressToTask" defaultChecked />
              Sync checklist progress to task
            </label>
            <Button type="submit" size="sm" variant="accent">Update checklist sync</Button>
          </form>
        </>
      ) : null}
    </div>
  );
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
      <form action={asFormAction(freezeMonthlySnapshotFromTools)} className="grid gap-2 border-t border-slate-200 pt-3">
        <div className="grid grid-cols-2 gap-2">
          <input type="number" name="year" className={inputClass} defaultValue={period.year} />
          <input type="number" name="month" className={inputClass} min="1" max="12" defaultValue={period.month} />
        </div>
        <Button type="submit" size="sm" variant="outline">Freeze monthly performance</Button>
      </form>
    </div>
  );
}

function TaskIdSelect({ tasks, name }: { tasks: readonly Task[]; name: string }) {
  return (
    <select name={name} className={inputClass} required>
      <option value="">Select task</option>
      {tasks.map((task) => (
        <option key={task.id} value={task.id}>{task.taskTag} · {task.title}</option>
      ))}
    </select>
  );
}

function TaskTagSelect({ tasks, name }: { tasks: readonly Task[]; name: string }) {
  return (
    <select name={name} className={inputClass} required>
      <option value="">Select task</option>
      {tasks.map((task) => (
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
    .select('id, task_id, user_id, started_at')
    .eq('status', 'Running')
    .order('started_at', { ascending: false });

  if (error) throw new Error(`Failed to load running timers: ${error.message}`);
  return data.map((row) => ({
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    startedAt: row.started_at,
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
