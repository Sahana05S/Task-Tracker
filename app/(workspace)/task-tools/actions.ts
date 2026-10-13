'use server';

import { loadChecklistRollups } from '@/lib/checklists/read-model';

import { initializeTaskDetails,saveTaskDetails,addTaskAsset,renameNativeLink } from '@/app/tasks/detail-actions';
import { randomUUID } from 'node:crypto';

import { revalidatePath } from 'next/cache';
import type { PostgrestError } from '@supabase/supabase-js';

import { createTask, updateTask, updateTaskStatus } from '@/app/tasks/actions';
import { createTaskLog, type LogActionState } from '@/app/logs/actions';

import { freezeMonthlySnapshot } from '@/app/dashboard/actions';
import { getTeamAnalytics } from '@/lib/analytics/queries';
import { performanceReport } from '@/lib/performance/report';
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
): Promise<LogActionState> {
  return createTaskLog(null, formData);
}

export async function updateTaskStatusFromTools(formData: FormData): Promise<TaskToolsActionState> {
  const taskId=readString(formData,'taskId'),version=readString(formData,'expectedVersion');
  const status=readString(formData,'status');
  if (!UUID_PATTERN.test(taskId ?? '') || !isTaskStatus(status) || !/^\d+$/.test(version ?? '')) return {success:false,error:'Select a task and valid status.'};
  return updateTaskStatus(taskId,status,Number(version),readString(formData,'operationId'),readString(formData,'reason'));
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

  const [assignees,reviewers] = await Promise.all([
    supabase.from('task_assignees').select('user_id,share_units').eq('task_id',sourceTaskId),
    supabase.from('task_reviewers').select('user_id').eq('task_id',sourceTaskId),
  ]);
  if (assignees.error) return {success:false,error:describeDatabaseError(assignees.error)};
  if (reviewers.error) return {success:false,error:describeDatabaseError(reviewers.error)};
  const assigneeIds = [...new Set([source.assignee_id,...assignees.data.map((row) => row.user_id)])];
  const reviewerIds = [...new Set([...(source.reviewer_id ? [source.reviewer_id] : []),...reviewers.data.map((row) => row.user_id)])];
  const shares = assigneeIds.map((id) => assignees.data.find((row) => row.user_id===id)?.share_units ?? null);
  if (assigneeIds.length>1 && shares.some((value) => value===null)) {
    return {success:false,error:'Review legacy shared credit before copying this task.'};
  }
  const [detailCopy,linkCopy]=await Promise.all([supabase.from('task_detail_sections').select('id').eq('task_id',sourceTaskId).limit(1),supabase.from('task_links').select('id').eq('task_id',sourceTaskId).limit(1)]);
  if(detailCopy.error || linkCopy.error)return {success:false,error:'Could not inspect source content.'};
  if(detailCopy.data.length || linkCopy.data.length)return {success:false,error:'Copying initialized task content requires the atomic M09 duplication workflow. No copy was created.'};
  const title = readString(formData,'title') || `${source.title} (Copy)`;
  const {data: createdId,error: createError} = await supabase.rpc('save_task_with_participants', {
    p_task_id:null,p_fields:{task_tag:newTaskTag,title,category:source.category,priority:source.priority,due_date:source.due_date,task_scale:source.task_scale,description:source.description,comments:source.comments},
    p_assignees:assigneeIds,p_reviewers:reviewerIds,p_share_units:shares.every((value) => value!==null) ? shares as number[] : null,
    p_expected_version:null,p_accept_legacy:false,p_operation_id:readString(formData,'operationId') || randomUUID(),
  });
  if (createError) return {success:false,error:describeDatabaseError(createError)};
  // Permissions/participants already committed together. Other copied content
  // remains the existing M09 workflow and does not grant any additional rights.
  const copyError = await copyTaskSupportRows(
    supabase,
    sourceTaskId,
    createdId,
    actor.profile.id,
  );
  if (copyError) return { success: false, error: copyError };

  revalidateTaskToolPaths(newTaskTag);
  return { success: true, data: { taskId: createdId, taskTag: newTaskTag } };
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

export async function updateTaskDetailsAction(form:FormData){return saveTaskDetails(form);}
export async function createTaskDetailsWithFolderAction(form:FormData){return initializeTaskDetails(form);}
export async function createWorkFileLinkAction(form:FormData){return addTaskAsset(form);}
export async function renameTaskFolderLinkAction(form:FormData){return renameNativeLink(form);}

export async function generateReportFromToolsAction(
  formData: FormData,
): Promise<TaskToolsActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  if (actor.profile.role !== 'managing_director') {
    return { success: false, error: 'Only the managing director can create report snapshots.' };
  }

  const period = readPeriod(formData);
  const analytics = await getTeamAnalytics(period);
  const title = readString(formData, 'title') || `${period.label} Task Report`;
  const reportType = readString(formData, 'reportType') || 'Task Tools Report';
  const employeeId = readUuid(formData, 'employeeId');
  const targetMember = employeeId
    ? analytics.members.find((member) => member.userId === employeeId)
    : null;
  const supabase = await createClient();
  const {data:taskRows,error:taskError}=await supabase.from('tasks').select('id, assignee_id');
  if(taskError)return {success:false,error:taskError.message};
  let taskIds=taskRows.map(t=>t.id);
  if(employeeId) {
    const {data:assigned,error:assignmentError}=await supabase.from('task_assignees').select('task_id').eq('user_id',employeeId);
    if(assignmentError)return {success:false,error:assignmentError.message};
    const ids=new Set(assigned.map(a=>a.task_id));
    taskIds=taskRows.filter(t=>t.assignee_id===employeeId || ids.has(t.id)).map(t=>t.id);
  }
  const checklistObservations=await loadChecklistRollups(supabase,taskIds);
  const payload = {
    performanceRuleVersion:analytics.calculation?.context.ruleVersion??'m07-unavailable',
    calculationContext:analytics.calculation?.context??null,
    calculationStatus:analytics.calculation?.status??'incomplete',
    performance:analytics.calculation?performanceReport(analytics.calculation,employeeId):null,
    checklistContract:'m05-checklist-v1',
    checklistAsOf:new Date().toISOString(),
    currentChecklists:Object.fromEntries(checklistObservations),
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

  const { data, error } = await supabase
    .from('report_snapshots')
    .insert({
      report_type: reportType,
      title,
      status: analytics.calculation?.status==='complete'?'Final':'Draft',
      calculation_rule_version:analytics.calculation?.context.ruleVersion??'m07-unavailable',
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
  const [sections, links] = await Promise.all([
    supabase.from('task_detail_sections').select('key_name, title, content').eq('task_id',sourceTaskId),
    supabase.from('task_links').select('link_type, label, url, storage_path, notes').eq('task_id',sourceTaskId),
  ]);
  for (const result of [sections,links]) if (result.error) return describeDatabaseError(result.error);

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
