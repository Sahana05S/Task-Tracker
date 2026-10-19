import type { ChecklistRollup } from '@/modules/checklists/client';
import { loadChecklistRollups } from '@/modules/checklists';
import type { TaskEffort } from '@/modules/tasks/internal/effort';
import { mapUser, USER_COLUMNS } from '@/shared/supabase/mappers';
import { createClient } from '@/shared/supabase/server';
import {
  mapTask,
  TASK_COLUMNS,
  withTaskParticipants,
} from '@/modules/tasks/internal/mappers';
import type {
  ChecklistNodeRow,
  TaskChecklistRow,
  TaskDependencyRow,
  TaskDetailSectionRow,
  TaskLinkRow,
  TaskRow,
} from '@/types/database';
import type {
  ChecklistNode,
  Task,
  TaskChecklist,
  TaskDependency,
  TaskDetailSection,
  TaskLink,
  User,
} from '@/types/tracker';

export interface TaskDependencyDetail {
  readonly dependency: TaskDependency;
  readonly otherTask: Task | null;
}

export interface TaskDetailData {
  readonly task: Task;
  readonly members: readonly User[];
  readonly sections: readonly TaskDetailSection[];
  readonly links: readonly TaskLink[];
  readonly dependencies: readonly TaskDependencyDetail[];
  readonly checklist: TaskChecklist | null;
  readonly checklistNodes: readonly ChecklistNode[];
  readonly linkedTasksById: ReadonlyMap<string, Task>;
  readonly checklistProgressPercentage: number | null;
  readonly checklistRollup?: ChecklistRollup;
  readonly effort: TaskEffort;
}

export type TaskDetailRouteState =
  | { readonly status: 'invalid' }
  | { readonly status: 'missing'; readonly taskTag: string }
  | { readonly status: 'ready'; readonly data: TaskDetailData };

export function normalizeTaskTagParam(rawTaskTag: string): string | null {
  try {
    const decoded = decodeURIComponent(rawTaskTag).trim();
    return decoded === '' || decoded.length > 30 ? null : decoded;
  } catch {
    return null;
  }
}

export async function resolveTaskDetailRouteState(
  rawTaskTag: string,
  loadData: (taskTag: string) => Promise<TaskDetailData | null> = getTaskDetailData,
): Promise<TaskDetailRouteState> {
  const normalizedTaskTag = normalizeTaskTagParam(rawTaskTag);

  if (!normalizedTaskTag) {
    return { status: 'invalid' };
  }

  const data = await loadData(normalizedTaskTag);

  if (!data) {
    return { status: 'missing', taskTag: normalizedTaskTag };
  }

  return { status: 'ready', data };
}

/**
 * Narrow read for the checklist workspace: the task and its assignees in one
 * request, instead of the full detail (members, links, sections, dependencies,
 * every checklist node and rollups) that page never shows.
 */
export async function getTaskForChecklist(rawTaskTag: string): Promise<Task | null> {
  const taskTag = normalizeTaskTagParam(rawTaskTag);
  if (!taskTag) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tasks')
    .select(`${TASK_COLUMNS}, task_assignees(user_id, is_primary)`)
    .eq('task_tag', taskTag)
    .maybeSingle();
  if (error) throw new Error(`Failed to load task: ${error.message}`);
  if (!data) return null;
  const { task_assignees: assignees, ...row } = data as unknown as TaskRow & {
    task_assignees: { user_id: string; is_primary: boolean }[] | null;
  };
  return withTaskParticipants(mapTask(row), { assigneeIds: uniquePrimaryFirst(assignees ?? []) });
}

export async function getTaskDetailData(
  taskTag: string,
): Promise<TaskDetailData | null> {
  const supabase = await createClient();

  const { data: taskRow, error: taskError } = await supabase
    .from('tasks')
    .select(TASK_COLUMNS)
    .eq('task_tag', taskTag)
    .maybeSingle();

  if (taskError) {
    throw new Error(`Failed to load task: ${taskError.message}`);
  }
  if (!taskRow) {
    return null;
  }

  let task = mapTask(taskRow);

  const [
    memberResult,
    assigneeRows,
    reviewerRows,
    sectionRows,
    linkRows,
    dependencyRows,
    checklistRow,
    effortResult,
    rollups,
  ] = await Promise.all([
    supabase.from('users').select(USER_COLUMNS).order('full_name'),
    selectOrEmpty(supabase.from('task_assignees').select('task_id, user_id, is_primary').eq('task_id', task.id)),
    selectOrEmpty(supabase.from('task_reviewers').select('task_id, user_id, is_primary').eq('task_id', task.id)),
    selectOrEmpty(supabase.from('task_detail_sections').select('*').eq('task_id', task.id).order('key_name')),
    selectOrEmpty(supabase.from('task_links').select('*').eq('task_id', task.id).order('link_type').order('label')),
    selectOrEmpty(
      supabase
        .from('task_dependencies')
        .select('*')
        .or(`predecessor_task_id.eq.${task.id},successor_task_id.eq.${task.id}`)
        .order('created_at', { ascending: false }),
    ),
    selectOneOrNull(
      readRootChecklist(supabase, task.id),
    ),
    supabase.rpc('task_effort_summary', {p_task_id: task.id}),
    // Needs only the task id, so it joins this wave instead of waiting for the nodes.
    loadChecklistRollups(supabase, [task.id]),
  ]);

  if (memberResult.error) {
    throw new Error(`Failed to load members: ${memberResult.error.message}`);
  }

  const assigneeIds = uniquePrimaryFirst(assigneeRows);
  const reviewerIds = uniquePrimaryFirst(reviewerRows);

  task = withTaskParticipants(task, {
    assigneeIds,
    reviewerIds,
  });

  const checklist = checklistRow ? mapTaskChecklist(checklistRow) : null;
  const checklistNodeRows = checklist
    ? await selectOrEmpty(
        supabase
          .from('checklist_nodes')
          .select('*')
          .eq('checklist_id', checklist.id)
          .order('sort_order'),
      )
    : [];
  const checklistNodes = checklistNodeRows.map(mapChecklistNode);
  const linkedTaskIds = [
    ...new Set(
      checklistNodes
        .map((node) => node.linkedTaskId)
        .filter((linkedTaskId): linkedTaskId is string => linkedTaskId !== null),
    ),
  ];
  const linkedTaskRows =
    linkedTaskIds.length === 0
      ? []
      : await selectOrEmpty(
          supabase.from('tasks').select(TASK_COLUMNS).in('id', linkedTaskIds),
        );
  const linkedTasksById = new Map(
    linkedTaskRows.map((row) => [row.id, mapTask(row)]),
  );
  const checklistProgress = rollups.get(task.id)!;

  const dependencyTaskIds = [
    ...new Set(
      dependencyRows.map((row) =>
        row.predecessor_task_id === task.id
          ? row.successor_task_id
          : row.predecessor_task_id,
      ),
    ),
  ];
  const dependencyTasks =
    dependencyTaskIds.length === 0
      ? []
      : await selectOrEmpty(
          supabase.from('tasks').select(TASK_COLUMNS).in('id', dependencyTaskIds),
        );
  const dependencyTaskById = new Map(
    dependencyTasks.map((row) => [row.id, mapTask(row)]),
  );

  if (effortResult.error) throw new Error(`Failed to load task effort: ${effortResult.error.message}`);
  const effort: TaskEffort = {
    hoursLogged: effortResult.data?.[0]?.hours_logged ?? 0,
    logCount: effortResult.data?.[0]?.log_count ?? 0,
  };

  return {
    task,
    members: memberResult.data.map(mapUser),
    sections: sectionRows.map(mapTaskDetailSection),
    links: linkRows.map(row=>{const link=mapTaskLink(row);const member=memberResult.data.find(m=>m.id===row.related_employee_id);return member?{...link,url:'/team/'+encodeURIComponent(member.employee_id)}:link;}),
    dependencies: dependencyRows.map((row) => {
      const otherTaskId =
        row.predecessor_task_id === task.id
          ? row.successor_task_id
          : row.predecessor_task_id;

      return {
        dependency: mapTaskDependency(row),
        otherTask: dependencyTaskById.get(otherTaskId) ?? null,
      };
    }),
    checklist,
    checklistNodes,
    linkedTasksById,
    checklistProgressPercentage: checklistProgress.taskProgress,
    checklistRollup: checklistProgress,
    effort,
  };
}

type QueryLike<T> = PromiseLike<{
  data: T[] | null;
  error: { code?: string; message: string } | null;
}>;

async function selectOrEmpty<T>(query: QueryLike<T>): Promise<T[]> {
  const { data, error } = await query;
  if (error) {
    if (error.code === '42P01') return [];
    throw new Error(error.message);
  }
  return data ?? [];
}

async function selectOneOrNull<T>(
  query: PromiseLike<{
    data: T | null;
    error: { code?: string; message: string } | null;
  }>,
): Promise<T | null> {
  const { data, error } = await query;
  if (error) {
    if (error.code === '42P01') return null;
    throw new Error(error.message);
  }
  return data;
}

function uniquePrimaryFirst(
  rows: readonly { readonly user_id: string; readonly is_primary: boolean }[],
): string[] {
  const sortedRows = [...rows].sort((a, b) => {
    if (a.is_primary === b.is_primary) return 0;
    return a.is_primary ? -1 : 1;
  });

  return [...new Set(sortedRows.map((row) => row.user_id))];
}

function mapTaskDetailSection(row: TaskDetailSectionRow): TaskDetailSection {
  return {
    id: row.id,
    taskId: row.task_id,
    keyName: row.key_name,
    title: row.title,
    content: row.content,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

function mapTaskLink(row: TaskLinkRow): TaskLink {
  return {
    id: row.id,
    taskId: row.task_id,
    ipoRole: row.ipo_role,
    relatedEmployeeId: row.related_employee_id,
    relatedReportId: row.related_report_id,
    linkType: row.link_type,
    label: row.label,
    url: row.url,
    storagePath: row.storage_path,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function mapTaskDependency(row: TaskDependencyRow): TaskDependency {
  return {
    id: row.id,
    predecessorTaskId: row.predecessor_task_id,
    successorTaskId: row.successor_task_id,
    relationType: row.relation_type,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

function mapTaskChecklist(row: TaskChecklistRow): TaskChecklist {
  return {
    id: row.id,
    taskId: row.task_id,
    templateId: row.template_id,
    ownerNodeId: row.owner_node_id ?? null,
    title: row.title,
    syncProgressToTask: row.sync_progress_to_task,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapChecklistNode(row: ChecklistNodeRow): ChecklistNode {
  return {
    id: row.id,
    checklistId: row.checklist_id,
    parentNodeId: row.parent_node_id,
    linkedTaskId: row.linked_task_id,
    nodeType: row.node_type,
    title: row.title,
    description: row.description,
    isComplete: row.is_complete,
    section: row.detail_section ?? null,
    completionState: row.completion_state ?? (row.is_complete?'Yes':'No'),
    sortOrder: row.sort_order,
    estimatedMinutes: row.estimated_minutes,
    links: row.links ?? [],
    elapsedSeconds: row.elapsed_seconds,
    completedBy: row.completed_by,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Existing test/deployment databases may still precede the Sub-mission migration. */
async function readRootChecklist(db: Awaited<ReturnType<typeof createClient>>, taskId: string) {
  const result = await db.from('task_checklists').select('*').eq('task_id', taskId).is('owner_node_id', null).maybeSingle();
  if (result.error?.code === '42703') return db.from('task_checklists').select('*').eq('task_id', taskId).maybeSingle();
  return result;
}
