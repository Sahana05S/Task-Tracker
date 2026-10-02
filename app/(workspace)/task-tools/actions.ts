'use server';

import { revalidatePath } from 'next/cache';
import type { PostgrestError } from '@supabase/supabase-js';

import { createTask, updateTask, updateTaskStatus } from '@/app/tasks/actions';
import { createTaskLog } from '@/app/logs/actions';
import {
  addChecklistNode,
  createMasterChecklist,
  setChecklistProgressSync,
} from '@/app/(workspace)/tasks/[taskTag]/checklist/actions';
import { freezeMonthlySnapshot } from '@/app/dashboard/actions';
import { getTeamAnalytics } from '@/lib/analytics/queries';
import { getCurrentProfile } from '@/lib/auth/profile';
import { recalculateTaskMetrics } from '@/lib/logs/task-metrics';
import { createClient } from '@/lib/supabase/server';
import {
  calculateSupportSplit,
  type SupportSplitMode,
} from '@/lib/task-tools/support-split';
import { canManageTasks } from '@/lib/tasks/permissions';
import {
  isTaskPriority,
  isTaskStatus,
  isTaskCategory,
} from '@/lib/tracker/enums';
import { type AnalyticsPeriod, currentPeriod } from '@/lib/analytics/engine';
import type { ActionResponse, TaskLinkType, User } from '@/types/tracker';

export type TaskToolsActionState = ActionResponse<{
  id?: string;
  taskId?: string;
  taskTag?: string;
  reportId?: string;
}>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type Actor =
  | { readonly ok: true; readonly profile: User }
  | { readonly ok: false; readonly error: string };

async function resolveActor(): Promise<Actor> {
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: 'You are not signed in.' };
  if (!profile.isActive) return { ok: false, error: 'Your account is deactivated.' };
  return { ok: true, profile };
}

export async function createTaskFromTools(
  formData: FormData,
): Promise<TaskToolsActionState> {
  return createTask(null, formData);
}

export async function updateTaskFromTools(
  formData: FormData,
): Promise<TaskToolsActionState> {
  return updateTask(null, formData);
}

export async function createTaskLogFromTools(
  formData: FormData,
): Promise<ActionResponse<{ logId: string }>> {
  return createTaskLog(null, formData);
}

export async function updateTaskStatusFromTools(
  formData: FormData,
): Promise<TaskToolsActionState> {
  const taskId = readUuid(formData, 'taskId');
  const status = readString(formData, 'status');
  if (!taskId) return { success: false, error: 'Select a task.' };
  if (!isTaskStatus(status)) return { success: false, error: 'Select a valid status.' };
  return updateTaskStatus(taskId, status);
}

export async function createMasterChecklistFromTools(
  formData: FormData,
): Promise<ActionResponse<{ checklistId?: string; nodeId?: string }>> {
  return createMasterChecklist(formData);
}

export async function addChecklistNodeFromTools(
  formData: FormData,
): Promise<ActionResponse<{ checklistId?: string; nodeId?: string }>> {
  return addChecklistNode(formData);
}

export async function setChecklistProgressSyncFromTools(
  formData: FormData,
): Promise<ActionResponse<{ checklistId?: string; nodeId?: string }>> {
  return setChecklistProgressSync(formData);
}

export async function refreshTaskMetricsAction(
  formData: FormData,
): Promise<TaskToolsActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };

  const taskId = readUuid(formData, 'taskId');
  if (!taskId) return { success: false, error: 'Select a task.' };

  const supabase = await createClient();
  const permitted = await canRefreshTaskMetrics(supabase, actor.profile, taskId);
  if (!permitted.ok) return { success: false, error: permitted.error };

  const refreshed = await recalculateTaskMetrics(supabase, taskId, 0);
  if (!refreshed.ok) return { success: false, error: refreshed.error };

  revalidateTaskToolPaths();
  return { success: true, data: { taskId } };
}

export async function duplicateTaskAction(
  formData: FormData,
): Promise<TaskToolsActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  if (!canManageTasks(actor.profile.role)) {
    return { success: false, error: 'Only managers can duplicate tasks.' };
  }

  const sourceTaskId = readUuid(formData, 'sourceTaskId');
  const newTaskTag = readString(formData, 'newTaskTag');
  if (!sourceTaskId) return { success: false, error: 'Select a source task.' };
  if (newTaskTag === '' || newTaskTag.length > 30) {
    return { success: false, error: 'Enter a unique task tag up to 30 characters.' };
  }

  const supabase = await createClient();
  const { data: source, error: sourceError } = await supabase
    .from('tasks')
    .select(
      'id, title, category, description, comments, assignee_id, reviewer_id, task_scale, priority, due_date',
    )
    .eq('id', sourceTaskId)
    .maybeSingle();

  if (sourceError) return { success: false, error: describeDatabaseError(sourceError) };
  if (!source) return { success: false, error: 'That source task no longer exists.' };

  const title = readString(formData, 'title') || `${source.title} (Copy)`;
  const { data: created, error: createError } = await supabase
    .from('tasks')
    .insert({
      task_tag: newTaskTag,
      title,
      category: source.category,
      description: source.description,
      comments: source.comments,
      assignee_id: source.assignee_id,
      reviewer_id: source.reviewer_id,
      task_scale: source.task_scale,
      priority: source.priority,
      due_date: source.due_date,
      progress_percentage: 0,
      status: 'Not Started',
      freshness: 'Fresh',
      valid_for_metrics: false,
    })
    .select('id')
    .single();

  if (createError) return { success: false, error: describeDatabaseError(createError) };

  const copyError = await copyTaskSupportRows(
    supabase,
    sourceTaskId,
    created.id,
    actor.profile.id,
  );
  if (copyError) return { success: false, error: copyError };

  revalidateTaskToolPaths(newTaskTag);
  return { success: true, data: { taskId: created.id, taskTag: newTaskTag } };
}

export async function createSupportTaskAction(
  formData: FormData,
): Promise<TaskToolsActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  if (!canManageTasks(actor.profile.role)) {
    return { success: false, error: 'Only managers can create support tasks.' };
  }

  const parentTaskId = readUuid(formData, 'parentTaskId');
  const taskTag = readString(formData, 'taskTag');
  const title = readString(formData, 'title');
  const category = readString(formData, 'category') || 'T';
  const priority = readString(formData, 'priority') || 'Medium';
  const assigneeId = readUuid(formData, 'assigneeId');

  if (!parentTaskId) return { success: false, error: 'Select the parent task.' };
  if (taskTag === '' || taskTag.length > 30) {
    return { success: false, error: 'Enter a support task tag up to 30 characters.' };
  }
  if (title === '') return { success: false, error: 'Enter a support task title.' };
  if (!assigneeId) return { success: false, error: 'Select an assignee.' };
  if (!isTaskCategory(category)) return { success: false, error: 'Select a valid category.' };
  if (!isTaskPriority(priority)) return { success: false, error: 'Select a valid priority.' };

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from('tasks')
    .insert({
      task_tag: taskTag,
      title,
      category,
      priority,
      assignee_id: assigneeId,
      reviewer_id: readUuid(formData, 'reviewerId'),
      due_date: readNullableDate(formData, 'dueDate'),
      task_scale: readNullableNumber(formData, 'taskScale') ?? 0,
      description: readNullableString(formData, 'description'),
      status: 'Not Started',
      progress_percentage: 0,
      freshness: 'Fresh',
      valid_for_metrics: false,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: describeDatabaseError(error) };

  const { error: assignmentError } = await supabase.from('task_assignees').insert({
    task_id: created.id,
    user_id: assigneeId,
    assignment_role: 'Support',
    is_primary: true,
    assigned_by: actor.profile.id,
  });
  if (assignmentError) {
    return { success: false, error: describeDatabaseError(assignmentError) };
  }

  const { error: relationError } = await supabase.from('task_dependencies').insert({
    predecessor_task_id: parentTaskId,
    successor_task_id: created.id,
    relation_type: 'Support',
    notes: readNullableString(formData, 'notes'),
    created_by: actor.profile.id,
  });
  if (relationError) return { success: false, error: describeDatabaseError(relationError) };

  revalidateTaskToolPaths(taskTag);
  return { success: true, data: { taskId: created.id, taskTag } };
}

export async function createSplitSupportTaskAction(
  formData: FormData,
): Promise<TaskToolsActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  if (!canManageTasks(actor.profile.role)) {
    return { success: false, error: 'Only managers can split support tasks.' };
  }

  const sourceTaskId = readUuid(formData, 'sourceTaskId');
  const taskTag = readString(formData, 'taskTag');
  const assigneeId = readUuid(formData, 'assigneeId');
  const supportKind = readString(formData, 'supportKind');
  const splitMode = readSupportSplitMode(formData);

  if (!sourceTaskId) return { success: false, error: 'Select the source task.' };
  if (taskTag === '' || taskTag.length > 30) {
    return { success: false, error: 'Enter a support task tag up to 30 characters.' };
  }
  if (!assigneeId) return { success: false, error: 'Select an assignee.' };
  if (!splitMode) return { success: false, error: 'Select a valid support split mode.' };

  const supabase = await createClient();
  const { data: source, error: sourceError } = await supabase
    .from('tasks')
    .select(
      'id, title, category, description, comments, reviewer_id, task_scale, priority, status, due_date',
    )
    .eq('id', sourceTaskId)
    .maybeSingle();

  if (sourceError) return { success: false, error: describeDatabaseError(sourceError) };
  if (!source) return { success: false, error: 'That source task no longer exists.' };

  let splitResult;
  try {
    splitResult = calculateSupportSplit({
      sourceScale: source.task_scale ?? 0,
      mode: splitMode,
      amount: readNullableNumber(formData, 'splitAmount'),
      percentage: readNullableNumber(formData, 'splitPercentage'),
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Invalid support split.',
    };
  }

  const isSkillSupport = supportKind === 'skill';
  const title =
    readString(formData, 'title') ||
    `${source.title} - ${isSkillSupport ? 'Skill Support' : 'Effort Support'}`;
  const reviewerId = readUuid(formData, 'reviewerId') ?? source.reviewer_id;

  if (splitResult.sourceScaleAfterSplit !== null) {
    const { error: updateError } = await supabase
      .from('tasks')
      .update({
        task_scale: splitResult.sourceScaleAfterSplit,
        valid_for_metrics:
          splitResult.sourceScaleAfterSplit > 0 && source.category !== 'OT',
      })
      .eq('id', sourceTaskId);
    if (updateError) return { success: false, error: describeDatabaseError(updateError) };
  }

  const { data: created, error } = await supabase
    .from('tasks')
    .insert({
      task_tag: taskTag,
      title,
      category: isSkillSupport ? 'SD' : source.category,
      description: source.description,
      comments: source.comments,
      assignee_id: assigneeId,
      reviewer_id: reviewerId,
      due_date: source.due_date,
      task_scale: splitResult.supportScale,
      priority: source.priority,
      status: source.status,
      progress_percentage: 0,
      freshness: 'Fresh',
      valid_for_metrics:
        splitResult.supportScale > 0 && (isSkillSupport ? 'SD' : source.category) !== 'OT',
    })
    .select('id')
    .single();

  if (error) return { success: false, error: describeDatabaseError(error) };

  const { error: assignmentError } = await supabase.from('task_assignees').insert({
    task_id: created.id,
    user_id: assigneeId,
    assignment_role: 'Support',
    is_primary: true,
    assigned_by: actor.profile.id,
  });
  if (assignmentError) {
    return { success: false, error: describeDatabaseError(assignmentError) };
  }

  if (reviewerId) {
    const { error: reviewerError } = await supabase.from('task_reviewers').insert({
      task_id: created.id,
      user_id: reviewerId,
      reviewer_role: 'Primary',
      is_primary: true,
      assigned_by: actor.profile.id,
    });
    if (reviewerError) {
      return { success: false, error: describeDatabaseError(reviewerError) };
    }
  }

  const { error: relationError } = await supabase.from('task_dependencies').insert({
    predecessor_task_id: sourceTaskId,
    successor_task_id: created.id,
    relation_type: 'Support',
    notes: `${isSkillSupport ? 'Skill Support' : 'Effort Support'} - ${splitMode}`,
    created_by: actor.profile.id,
  });
  if (relationError) return { success: false, error: describeDatabaseError(relationError) };

  revalidateTaskToolPaths(taskTag);
  return { success: true, data: { taskId: created.id, taskTag } };
}

export async function updateTaskDetailsAction(
  formData: FormData,
): Promise<TaskToolsActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  if (!canManageTasks(actor.profile.role)) {
    return { success: false, error: 'Only managers can update task details.' };
  }

  const taskId = readUuid(formData, 'taskId');
  const keyName = slugKey(readString(formData, 'keyName'));
  const title = readString(formData, 'title');
  if (!taskId) return { success: false, error: 'Select a task.' };
  if (!keyName) return { success: false, error: 'Enter a detail key.' };
  if (!title) return { success: false, error: 'Enter a detail title.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('task_detail_sections')
    .upsert(
      {
        task_id: taskId,
        key_name: keyName,
        title,
        content: readNullableString(formData, 'content'),
        updated_by: actor.profile.id,
      },
      { onConflict: 'task_id,key_name' },
    )
    .select('id')
    .single();

  if (error) return { success: false, error: describeDatabaseError(error) };
  revalidateTaskToolPaths();
  return { success: true, data: { id: data.id, taskId } };
}

export async function createTaskDetailsWithFolderAction(
  formData: FormData,
): Promise<TaskToolsActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  if (!canManageTasks(actor.profile.role)) {
    return { success: false, error: 'Only managers can create task detail pages.' };
  }

  const taskId = readUuid(formData, 'taskId');
  if (!taskId) return { success: false, error: 'Select a task.' };

  const supabase = await createClient();
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .select('id, task_tag, title')
    .eq('id', taskId)
    .maybeSingle();
  if (taskError) return { success: false, error: describeDatabaseError(taskError) };
  if (!task) return { success: false, error: 'That task no longer exists.' };

  const carryoverTaskTag = readNullableString(formData, 'carryoverTaskTag');
  const folderUrl = readNullableString(formData, 'folderUrl');
  const masterChecklistUrl = readNullableString(formData, 'masterChecklistUrl');

  const sections = [
    ['task_summary', 'Task summary', task.title],
    ['smart_goals', 'SMART goal statements', 'Specific\nMeasurable\nAchievable\nRelevant\nTime-Bound'],
    ['inputs', 'Inputs', 'Document\nAccount\nFlowchart\nEngineering\nDrawing\nDependency Tasks'],
    ['process', 'Process', 'Master Checklist\nDocument\nAccount\nFlowchart\nEngineering\nDrawing\nDependency Tasks'],
    ['outputs', 'Outputs', 'Document\nAccount\nFlowchart\nEngineering\nDrawing\nDependency Tasks'],
    ['task_log', 'Task log', 'Date\nUpdate\nHours Worked\nRaw Links'],
    ['carryover', 'Carryover task', carryoverTaskTag ?? ''],
  ] as const;

  const { error: sectionError } = await supabase.from('task_detail_sections').upsert(
    sections.map(([keyName, title, content]) => ({
      task_id: taskId,
      key_name: keyName,
      title,
      content,
      updated_by: actor.profile.id,
    })),
    { onConflict: 'task_id,key_name' },
  );
  if (sectionError) return { success: false, error: describeDatabaseError(sectionError) };

  const links = [
    folderUrl
      ? {
          task_id: taskId,
          link_type: 'Folder' as const,
          label: `${task.task_tag} - Task Folder`,
          url: folderUrl,
          storage_path: null,
          notes: 'Equivalent to Apps Script createFolderFromSelection.',
          created_by: actor.profile.id,
        }
      : null,
    masterChecklistUrl
      ? {
          task_id: taskId,
          link_type: 'Checklist' as const,
          label: `${task.task_tag} - Master Checklist`,
          url: masterChecklistUrl,
          storage_path: null,
          notes: 'Master checklist linked from the task page.',
          created_by: actor.profile.id,
        }
      : null,
  ].filter((link): link is NonNullable<typeof link> => link !== null);

  if (links.length > 0) {
    const { error: linkError } = await supabase.from('task_links').insert(links);
    if (linkError) return { success: false, error: describeDatabaseError(linkError) };
  }

  revalidateTaskToolPaths(task.task_tag);
  return { success: true, data: { taskId, taskTag: task.task_tag } };
}

export async function createWorkFileLinkAction(
  formData: FormData,
): Promise<TaskToolsActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  if (!canManageTasks(actor.profile.role)) {
    return { success: false, error: 'Only managers can create task work-file links.' };
  }

  const taskId = readUuid(formData, 'taskId');
  const label = readString(formData, 'label');
  const url = readNullableString(formData, 'url');
  const linkType = readTaskLinkType(formData);
  if (!taskId) return { success: false, error: 'Select a task.' };
  if (!label) return { success: false, error: 'Enter a file label.' };
  if (!url) return { success: false, error: 'Enter a folder or asset URL.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('task_links')
    .insert({
      task_id: taskId,
      link_type: linkType,
      label,
      url,
      storage_path: null,
      notes: readNullableString(formData, 'notes'),
      created_by: actor.profile.id,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: describeDatabaseError(error) };
  revalidateTaskToolPaths();
  return { success: true, data: { id: data.id, taskId } };
}

export async function renameTaskFolderLinkAction(
  formData: FormData,
): Promise<TaskToolsActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  if (!canManageTasks(actor.profile.role)) {
    return { success: false, error: 'Only managers can rename task folder links.' };
  }

  const taskId = readUuid(formData, 'taskId');
  const taskTitle = readString(formData, 'taskTitle');
  if (!taskId) return { success: false, error: 'Select a task.' };
  if (!taskTitle) return { success: false, error: 'Enter the task title replacement.' };

  const supabase = await createClient();
  const { data: folderLink, error: readError } = await supabase
    .from('task_links')
    .select('id, label, notes')
    .eq('task_id', taskId)
    .eq('link_type', 'Folder')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (readError) return { success: false, error: describeDatabaseError(readError) };
  if (!folderLink) return { success: false, error: 'No task folder link exists yet.' };

  const nextLabel = folderLink.label.includes('[Task Title]')
    ? folderLink.label.replace('[Task Title]', taskTitle)
    : `${folderLink.label} - ${taskTitle}`;

  const { error } = await supabase
    .from('task_links')
    .update({
      label: nextLabel,
      notes: folderLink.notes
        ? `${folderLink.notes}\nRenamed task folder title to: ${taskTitle}`
        : `Renamed task folder title to: ${taskTitle}`,
    })
    .eq('id', folderLink.id);

  if (error) return { success: false, error: describeDatabaseError(error) };
  revalidateTaskToolPaths();
  return { success: true, data: { id: folderLink.id, taskId } };
}

export async function generateReportFromToolsAction(
  formData: FormData,
): Promise<TaskToolsActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  if (!canManageTasks(actor.profile.role)) {
    return { success: false, error: 'Only managers can generate reports.' };
  }

  const period = readPeriod(formData);
  const analytics = await getTeamAnalytics(period);
  const title = readString(formData, 'title') || `${period.label} Task Report`;
  const reportType = readString(formData, 'reportType') || 'Task Tools Report';
  const employeeId = readUuid(formData, 'employeeId');
  const targetMember = employeeId
    ? analytics.members.find((member) => member.userId === employeeId)
    : null;
  const payload = {
    period,
    generatedBy: actor.profile.id,
    reportKind: targetMember ? 'employee' : 'general',
    summary: targetMember
      ? {
          employee: targetMember.fullName,
          starScore: targetMember.starScore,
          hoursLogged: targetMember.hoursLogged,
          scaledProgress: targetMember.scaledProgress,
          taskCount: targetMember.taskCount,
        }
      : {
          averageProductivity: analytics.totals.averageProductivity,
          hoursLogged: analytics.totals.hoursLogged,
          scaledProgress: analytics.totals.scaledProgress,
          activeMemberCount: analytics.totals.activeMemberCount,
          starPerformer: analytics.starPerformer?.fullName ?? null,
        },
  };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('report_snapshots')
    .insert({
      report_type: reportType,
      title,
      status: 'Final',
      period_start: period.startDate,
      period_end: period.endDate,
      employee_id: employeeId,
      payload: payload as never,
      created_by: actor.profile.id,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: describeDatabaseError(error) };
  revalidatePath('/reports');
  revalidatePath('/team');
  return { success: true, data: { reportId: data.id } };
}

export async function freezeMonthlySnapshotFromTools(
  formData: FormData,
): Promise<ActionResponse<{ insertedCount: number }>> {
  const year = Number(readString(formData, 'year'));
  const month = Number(readString(formData, 'month'));
  const result = await freezeMonthlySnapshot(
    Number.isInteger(year) ? year : undefined,
    Number.isInteger(month) ? month : undefined,
  );

  if (!result.success) {
    return { success: false, error: result.error ?? 'Snapshot failed.' };
  }
  return {
    success: true,
    data: { insertedCount: result.data?.memberCount ?? 0 },
  };
}

async function canRefreshTaskMetrics(
  supabase: Awaited<ReturnType<typeof createClient>>,
  profile: User,
  taskId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (canManageTasks(profile.role)) return { ok: true };

  const { data: task, error } = await supabase
    .from('tasks')
    .select('assignee_id')
    .eq('id', taskId)
    .maybeSingle();
  if (error) return { ok: false, error: describeDatabaseError(error) };
  if (!task) return { ok: false, error: 'That task no longer exists.' };
  if (task.assignee_id === profile.id) return { ok: true };

  const { data: assignment, error: assignmentError } = await supabase
    .from('task_assignees')
    .select('id')
    .eq('task_id', taskId)
    .eq('user_id', profile.id)
    .maybeSingle();
  if (assignmentError) {
    return { ok: false, error: describeDatabaseError(assignmentError) };
  }
  return assignment
    ? { ok: true }
    : { ok: false, error: 'You can only refresh metrics for assigned tasks.' };
}

async function copyTaskSupportRows(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sourceTaskId: string,
  targetTaskId: string,
  actorId: string,
): Promise<string | null> {
  const [assignees, reviewers, sections, links] = await Promise.all([
    supabase
      .from('task_assignees')
      .select('user_id, assignment_role, is_primary')
      .eq('task_id', sourceTaskId),
    supabase
      .from('task_reviewers')
      .select('user_id, reviewer_role, is_primary')
      .eq('task_id', sourceTaskId),
    supabase
      .from('task_detail_sections')
      .select('key_name, title, content')
      .eq('task_id', sourceTaskId),
    supabase
      .from('task_links')
      .select('link_type, label, url, storage_path, notes')
      .eq('task_id', sourceTaskId),
  ]);

  for (const result of [assignees, reviewers, sections, links]) {
    if (result.error) return describeDatabaseError(result.error);
  }

  if ((assignees.data ?? []).length > 0) {
    const { error } = await supabase.from('task_assignees').insert(
      (assignees.data ?? []).map((row) => ({
        task_id: targetTaskId,
        user_id: row.user_id,
        assignment_role: row.assignment_role,
        is_primary: row.is_primary,
        assigned_by: actorId,
      })),
    );
    if (error) return describeDatabaseError(error);
  }

  if ((reviewers.data ?? []).length > 0) {
    const { error } = await supabase.from('task_reviewers').insert(
      (reviewers.data ?? []).map((row) => ({
        task_id: targetTaskId,
        user_id: row.user_id,
        reviewer_role: row.reviewer_role,
        is_primary: row.is_primary,
        assigned_by: actorId,
      })),
    );
    if (error) return describeDatabaseError(error);
  }

  if ((sections.data ?? []).length > 0) {
    const { error } = await supabase.from('task_detail_sections').insert(
      (sections.data ?? []).map((row) => ({
        task_id: targetTaskId,
        key_name: row.key_name,
        title: row.title,
        content: row.content,
        updated_by: actorId,
      })),
    );
    if (error) return describeDatabaseError(error);
  }

  if ((links.data ?? []).length > 0) {
    const { error } = await supabase.from('task_links').insert(
      (links.data ?? []).map((row) => ({
        task_id: targetTaskId,
        link_type: row.link_type,
        label: row.label,
        url: row.url,
        storage_path: row.storage_path,
        notes: row.notes,
        created_by: actorId,
      })),
    );
    if (error) return describeDatabaseError(error);
  }

  return null;
}

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function readNullableString(formData: FormData, key: string): string | null {
  const value = readString(formData, key);
  return value === '' ? null : value;
}

function readUuid(formData: FormData, key: string): string | null {
  const value = readString(formData, key);
  return UUID_PATTERN.test(value) ? value : null;
}

function readNullableDate(formData: FormData, key: string): string | null {
  const value = readString(formData, key);
  return value === '' ? null : ISO_DATE_PATTERN.test(value) ? value : null;
}

function readNullableNumber(formData: FormData, key: string): number | null {
  const value = readString(formData, key);
  if (value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readTaskLinkType(formData: FormData): TaskLinkType {
  const value = readString(formData, 'linkType');
  const allowed: readonly TaskLinkType[] = [
    'Folder',
    'Document',
    'Account',
    'Flowchart',
    'Engineering',
    'Drawing',
    'Checklist',
    'Raw Link',
    'Other',
  ];
  return allowed.includes(value as TaskLinkType) ? (value as TaskLinkType) : 'Other';
}

function readSupportSplitMode(formData: FormData): SupportSplitMode | null {
  const value = readString(formData, 'splitMode');
  const allowed: readonly SupportSplitMode[] = [
    'split-even',
    'split-uneven',
    'proportional',
    'absolute',
  ];
  return allowed.includes(value as SupportSplitMode)
    ? (value as SupportSplitMode)
    : null;
}

function readPeriod(formData: FormData): AnalyticsPeriod {
  const year = Number(readString(formData, 'year'));
  const month = Number(readString(formData, 'month'));
  if (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    year >= 2026 &&
    month >= 1 &&
    month <= 12
  ) {
    return {
      ...currentPeriod(new Date(Date.UTC(year, month - 1, 1))),
      year,
      month,
    };
  }
  return currentPeriod();
}

function slugKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function describeDatabaseError(error: PostgrestError): string {
  if (error.code === '42501') return 'You do not have permission for that workflow.';
  if (error.code === '23505') return 'That record already exists.';
  if (error.code === '23503') return 'A linked task or employee no longer exists.';
  if (error.code === '23514') return 'A submitted value is outside its permitted range.';
  return error.message;
}

function revalidateTaskToolPaths(taskTag?: string) {
  revalidatePath('/task-tools');
  revalidatePath('/tasks');
  revalidatePath('/dashboard');
  revalidatePath('/timelines');
  if (taskTag) revalidatePath(`/tasks/${encodeURIComponent(taskTag)}`);
}
