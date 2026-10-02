'use server';

import { revalidatePath } from 'next/cache';
import type { PostgrestError } from '@supabase/supabase-js';

import { syncTaskProgressForChecklist } from '@/lib/checklists/sync';
import { getCurrentProfile } from '@/lib/auth/profile';
import { createClient } from '@/lib/supabase/server';
import {
  canManageTasks,
  canUpdateTaskOwnFields,
} from '@/lib/tasks/permissions';
import { normalizeTaskTagParam } from '@/lib/tasks/detail';
import { isChecklistNodeType } from '@/lib/tracker/enums';
import type {
  ActionResponse,
  ChecklistNodeType,
  Task,
  User,
} from '@/types/tracker';

export type ChecklistActionState = ActionResponse<{
  checklistId?: string;
  nodeId?: string;
}>;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Actor =
  | { readonly ok: true; readonly profile: User }
  | { readonly ok: false; readonly error: string };

async function resolveActor(): Promise<Actor> {
  const profile = await getCurrentProfile();

  if (!profile) return { ok: false, error: 'You are not signed in.' };
  if (!profile.isActive) {
    return { ok: false, error: 'Your account is deactivated.' };
  }

  return { ok: true, profile };
}

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function readOptionalId(formData: FormData, key: string): string | null {
  const value = readString(formData, key);
  return UUID_PATTERN.test(value) ? value : null;
}

function readBoolean(formData: FormData, key: string): boolean {
  const value = readString(formData, key);
  return value === 'true' || value === 'on' || value === '1';
}

function describeDatabaseError(error: PostgrestError): string {
  switch (error.code) {
    case '23503':
      return 'A referenced task or checklist item no longer exists.';
    case '23505':
      return 'That checklist relation already exists.';
    case '23514':
      return 'A checklist value is outside its permitted range.';
    case '42501':
      return 'You do not have permission to perform that change.';
    default:
      return error.message;
  }
}

async function resolveTaskAccess(
  supabase: SupabaseServerClient,
  rawTaskTag: string,
  profile: User,
): Promise<
  | {
      readonly ok: true;
      readonly task: Pick<Task, 'id' | 'taskTag' | 'title' | 'assigneeId' | 'assigneeIds'>;
      readonly canManage: boolean;
      readonly canUpdate: boolean;
    }
  | { readonly ok: false; readonly error: string }
> {
  const taskTag = normalizeTaskTagParam(rawTaskTag);
  if (!taskTag) return { ok: false, error: 'Missing task reference.' };

  const { data: taskRow, error: taskError } = await supabase
    .from('tasks')
    .select('id, task_tag, title, assignee_id')
    .eq('task_tag', taskTag)
    .maybeSingle();

  if (taskError) return { ok: false, error: describeDatabaseError(taskError) };
  if (!taskRow) return { ok: false, error: 'That task no longer exists.' };

  const { data: assigneeRows, error: assigneeError } = await supabase
    .from('task_assignees')
    .select('user_id')
    .eq('task_id', taskRow.id);

  if (assigneeError) {
    return { ok: false, error: describeDatabaseError(assigneeError) };
  }

  const task = {
    id: taskRow.id,
    taskTag: taskRow.task_tag,
    title: taskRow.title,
    assigneeId: taskRow.assignee_id,
    assigneeIds: assigneeRows.map((row) => row.user_id),
  };
  const canManage = canManageTasks(profile.role);

  return {
    ok: true,
    task,
    canManage,
    canUpdate: canUpdateTaskOwnFields(profile, task),
  };
}

function revalidateChecklist(taskTag: string): void {
  const encodedTaskTag = encodeURIComponent(taskTag);
  revalidatePath(`/tasks/${encodedTaskTag}/checklist`);
  revalidatePath(`/tasks/${encodedTaskTag}`);
  revalidatePath('/tasks');
  revalidatePath('/dashboard');
}

export async function createMasterChecklist(
  formData: FormData,
): Promise<ChecklistActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };

  const supabase = await createClient();
  const taskAccess = await resolveTaskAccess(
    supabase,
    readString(formData, 'taskTag'),
    actor.profile,
  );
  if (!taskAccess.ok) return { success: false, error: taskAccess.error };
  if (!taskAccess.canUpdate) {
    return {
      success: false,
      error: 'You can only create checklists for tasks assigned to you.',
    };
  }

  const title =
    readString(formData, 'title') ||
    `CHECKLIST - ${taskAccess.task.title}`;

  const { data, error } = await supabase
    .from('task_checklists')
    .insert({
      task_id: taskAccess.task.id,
      title,
      created_by: actor.profile.id,
      sync_progress_to_task: readBoolean(formData, 'syncProgressToTask'),
    })
    .select('id')
    .single();

  if (error) return { success: false, error: describeDatabaseError(error) };

  revalidateChecklist(taskAccess.task.taskTag);
  return { success: true, data: { checklistId: data.id } };
}

export async function setChecklistProgressSync(
  formData: FormData,
): Promise<ChecklistActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  if (!canManageTasks(actor.profile.role)) {
    return {
      success: false,
      error: 'Only managers can change checklist progress sync.',
    };
  }

  const checklistId = readOptionalId(formData, 'checklistId');
  const taskTag = normalizeTaskTagParam(readString(formData, 'taskTag'));
  if (!checklistId) return { success: false, error: 'Missing checklist reference.' };
  if (!taskTag) return { success: false, error: 'Missing task reference.' };

  const supabase = await createClient();
  const enabled = readBoolean(formData, 'syncProgressToTask');
  const { error } = await supabase
    .from('task_checklists')
    .update({ sync_progress_to_task: enabled })
    .eq('id', checklistId)
    .select('id')
    .single();

  if (error) return { success: false, error: describeDatabaseError(error) };

  if (enabled) {
    const synced = await syncTaskProgressForChecklist(
      supabase,
      checklistId,
      { force: true },
    );
    if (!synced.ok) return { success: false, error: synced.error };
  }

  revalidateChecklist(taskTag);

  return { success: true, data: { checklistId } };
}

export async function addChecklistNode(
  formData: FormData,
): Promise<ChecklistActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };

  const supabase = await createClient();
  const taskAccess = await resolveTaskAccess(
    supabase,
    readString(formData, 'taskTag'),
    actor.profile,
  );
  if (!taskAccess.ok) return { success: false, error: taskAccess.error };
  if (!taskAccess.canManage) {
    return {
      success: false,
      error: 'Only managers can add checklist pages, groups, and items.',
    };
  }

  const checklistId = readOptionalId(formData, 'checklistId');
  if (!checklistId) return { success: false, error: 'Missing checklist reference.' };

  const nodeTypeRaw = readString(formData, 'nodeType');
  if (!isChecklistNodeType(nodeTypeRaw)) {
    return { success: false, error: 'Select a valid checklist node type.' };
  }
  const nodeType: ChecklistNodeType = nodeTypeRaw;

  const title = readString(formData, 'title');
  if (title === '') return { success: false, error: 'Enter a checklist title.' };
  if (title.length > 180) {
    return { success: false, error: 'Checklist title must be 180 characters or fewer.' };
  }

  const parentNodeId = readOptionalId(formData, 'parentNodeId');
  const linkedTaskTag = readString(formData, 'linkedTaskTag');
  const linkedTaskId =
    linkedTaskTag === ''
      ? null
      : await resolveLinkedTaskId(supabase, linkedTaskTag, taskAccess.task.id);

  if (linkedTaskId === undefined) {
    return { success: false, error: 'Linked task tag was not found.' };
  }
  if (nodeType === 'Task' && linkedTaskId === null) {
    return { success: false, error: 'Enter a linked task tag for task nodes.' };
  }

  if (parentNodeId) {
    const parentValid = await ensureParentBelongsToChecklist(
      supabase,
      checklistId,
      parentNodeId,
    );
    if (!parentValid.ok) return { success: false, error: parentValid.error };
  }

  const sortOrder = await nextSortOrder(supabase, checklistId, parentNodeId);
  const { data, error } = await supabase
    .from('checklist_nodes')
    .insert({
      checklist_id: checklistId,
      parent_node_id: parentNodeId,
      linked_task_id: linkedTaskId,
      node_type: nodeType,
      title,
      description: readString(formData, 'description') || null,
      sort_order: sortOrder,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: describeDatabaseError(error) };

  if (linkedTaskId) {
    const relationError = await linkSubtaskRelation(
      supabase,
      taskAccess.task.id,
      linkedTaskId,
      actor.profile.id,
    );
    if (relationError) return { success: false, error: relationError };
  }

  const synced = await syncTaskProgressForChecklist(supabase, checklistId);
  if (!synced.ok) return { success: false, error: synced.error };

  revalidateChecklist(taskAccess.task.taskTag);
  return { success: true, data: { checklistId, nodeId: data.id } };
}

export async function toggleChecklistNode(
  formData: FormData,
): Promise<ChecklistActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };

  const supabase = await createClient();
  const taskAccess = await resolveTaskAccess(
    supabase,
    readString(formData, 'taskTag'),
    actor.profile,
  );
  if (!taskAccess.ok) return { success: false, error: taskAccess.error };
  if (!taskAccess.canUpdate) {
    return {
      success: false,
      error: 'You can only update checklist items for tasks assigned to you.',
    };
  }

  const nodeId = readOptionalId(formData, 'nodeId');
  if (!nodeId) return { success: false, error: 'Missing checklist item.' };

  const isComplete = readBoolean(formData, 'isComplete');
  const { data, error } = await supabase
    .from('checklist_nodes')
    .update({
      is_complete: isComplete,
      completed_by: isComplete ? actor.profile.id : null,
      completed_at: isComplete ? new Date().toISOString() : null,
    })
    .eq('id', nodeId)
    .select('id, checklist_id')
    .single();

  if (error) return { success: false, error: describeDatabaseError(error) };

  const synced = await syncTaskProgressForChecklist(
    supabase,
    data.checklist_id,
  );
  if (!synced.ok) return { success: false, error: synced.error };

  revalidateChecklist(taskAccess.task.taskTag);
  return {
    success: true,
    data: { checklistId: data.checklist_id, nodeId: data.id },
  };
}

export async function deleteChecklistNode(
  formData: FormData,
): Promise<ChecklistActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  if (!canManageTasks(actor.profile.role)) {
    return {
      success: false,
      error: 'Only managers can delete checklist nodes.',
    };
  }

  const nodeId = readOptionalId(formData, 'nodeId');
  const checklistId = readOptionalId(formData, 'checklistId');
  const taskTag = normalizeTaskTagParam(readString(formData, 'taskTag'));
  if (!nodeId || !checklistId || !taskTag) {
    return { success: false, error: 'Missing checklist item.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('checklist_nodes')
    .delete()
    .eq('id', nodeId)
    .eq('checklist_id', checklistId);

  if (error) return { success: false, error: describeDatabaseError(error) };

  const synced = await syncTaskProgressForChecklist(supabase, checklistId);
  if (!synced.ok) return { success: false, error: synced.error };

  revalidateChecklist(taskTag);
  return { success: true, data: { checklistId, nodeId } };
}

async function resolveLinkedTaskId(
  supabase: SupabaseServerClient,
  taskTag: string,
  currentTaskId: string,
): Promise<string | null | undefined> {
  const normalizedTaskTag = normalizeTaskTagParam(taskTag);
  if (!normalizedTaskTag) return undefined;

  const { data, error } = await supabase
    .from('tasks')
    .select('id')
    .eq('task_tag', normalizedTaskTag)
    .maybeSingle();

  if (error) throw new Error(describeDatabaseError(error));
  if (!data) return undefined;
  if (data.id === currentTaskId) return undefined;
  return data.id;
}

async function ensureParentBelongsToChecklist(
  supabase: SupabaseServerClient,
  checklistId: string,
  parentNodeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from('checklist_nodes')
    .select('id')
    .eq('id', parentNodeId)
    .eq('checklist_id', checklistId)
    .maybeSingle();

  if (error) return { ok: false, error: describeDatabaseError(error) };
  if (!data) return { ok: false, error: 'Parent checklist item was not found.' };
  return { ok: true };
}

async function nextSortOrder(
  supabase: SupabaseServerClient,
  checklistId: string,
  parentNodeId: string | null,
): Promise<number> {
  let query = supabase
    .from('checklist_nodes')
    .select('sort_order')
    .eq('checklist_id', checklistId)
    .order('sort_order', { ascending: false })
    .limit(1);

  query =
    parentNodeId === null
      ? query.is('parent_node_id', null)
      : query.eq('parent_node_id', parentNodeId);

  const { data, error } = await query;
  if (error) throw new Error(describeDatabaseError(error));
  return (data.at(0)?.sort_order ?? -1) + 1;
}

async function linkSubtaskRelation(
  supabase: SupabaseServerClient,
  parentTaskId: string,
  linkedTaskId: string,
  actorId: string,
): Promise<string | null> {
  const { error } = await supabase.from('task_dependencies').insert({
    predecessor_task_id: parentTaskId,
    successor_task_id: linkedTaskId,
    relation_type: 'Subtask',
    created_by: actorId,
  });

  if (!error || error.code === '23505') return null;
  return describeDatabaseError(error);
}
