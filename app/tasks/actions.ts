'use server';

import { randomUUID } from 'node:crypto';
import { readParticipantShares } from '@/lib/tasks/shares';

import { revalidatePath } from 'next/cache';
import type { PostgrestError } from '@supabase/supabase-js';

import { getCurrentProfile } from '@/shared/session/profile';
import { commandIdentity, executionError } from '@/shared/commands/result';
import type { Json } from '@/types/database';
import { createClient } from '@/shared/supabase/server';
import {
  isTaskCategory,
  isTaskPriority,
  isTaskStatus,
} from '@/shared/tracker/enums';
import { canManageTasks } from '@/lib/tasks/permissions';
import type { ActionResponse, TaskStatus, User } from '@/types/tracker';

/**
 * Task Server Actions.
 *
 * Authorisation is enforced twice on purpose. These checks run first so the UI
 * can show a meaningful message, and the RLS policies in
 * `01_init_schema.sql` run last and are the real boundary. If this file were
 * bypassed entirely, the database would still refuse the write.
 *
 * Division of rights, per the brief:
 *   managing_director, project_engineer   create, fully edit, delete any task
 *   assignee                              status and progress on their own tasks
 */

export type TaskActionState = ActionResponse<{ taskId: string }>;

/* -------------------------------------------------------------------------- */
/* Actor resolution                                                           */
/* -------------------------------------------------------------------------- */

type Actor =
  | { readonly ok: true; readonly profile: User }
  | { readonly ok: false; readonly error: string };

async function resolveActor(): Promise<Actor> {
  const profile = await getCurrentProfile();

  if (!profile) {
    return { ok: false, error: 'You are not signed in.' };
  }
  if (!profile.isActive) {
    return { ok: false, error: 'Your account is deactivated.' };
  }

  return { ok: true, profile };
}

/* -------------------------------------------------------------------------- */
/* Input handling                                                             */
/* -------------------------------------------------------------------------- */

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

/** Empty strings become `null`, matching the nullable columns. */
function readNullableString(formData: FormData, key: string): string | null {
  const value = readString(formData, key);
  return value === '' ? null : value;
}

/**
 * Sentinel the reviewer picker submits for "nobody".
 *
 * Radix Select reserves the empty string to mean "no selection shown", so an
 * optional reference cannot round-trip as `''` and needs a stand-in value.
 */
const NO_SELECTION = 'none';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reads an optional foreign key.
 *
 * Returns `null` for blank input and for the picker's sentinel, and `undefined`
 * for anything that is not a UUID — which lets the caller reject malformed input
 * rather than handing PostgreSQL a value it will only fail on.
 */
function readOptionalId(
  formData: FormData,
  key: string,
): string | null | undefined {
  const value = readString(formData, key);
  if (value === '' || value === NO_SELECTION) return null;
  return UUID_PATTERN.test(value) ? value : undefined;
}

/** Reads a required foreign key. `null` means missing or malformed. */
function readRequiredId(formData: FormData, key: string): string | null {
  const value = readString(formData, key);
  if (value === '' || value === NO_SELECTION) return null;
  return UUID_PATTERN.test(value) ? value : null;
}

function readIdList(
  formData: FormData,
  multiKey: string,
  legacyKey?: string,
): string[] | null {
  const rawValues = formData
    .getAll(multiKey)
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value !== '' && value !== NO_SELECTION);

  if (rawValues.length === 0 && legacyKey) {
    const legacyValue = readRequiredId(formData, legacyKey);
    if (legacyValue) rawValues.push(legacyValue);
  }

  const uniqueValues = [...new Set(rawValues)];
  return uniqueValues.every((value) => UUID_PATTERN.test(value))
    ? uniqueValues
    : null;
}

/**
 * Parses a numeric field. Returns `null` for blank input and `undefined` for
 * input that is present but not a finite number, letting the caller tell
 * "cleared" apart from "invalid".
 */
function readNullableNumber(
  formData: FormData,
  key: string,
): number | null | undefined {
  const raw = readString(formData, key);
  if (raw === '') return null;

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Today as an ISO date in UTC, matching how DATE columns are compared. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/* Error translation                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Turns a PostgREST error into something a user can act on.
 *
 * `42501` is the one that matters: it is what RLS returns when a policy refuses
 * the write, and it is the signal that the checks above were circumvented or are
 * out of step with the policies.
 */
function describeDatabaseError(error: PostgrestError): string {
  switch (error.code) {
    case '23505':
      return 'That task tag is already in use. Task tags must be unique.';
    case '23503':
      return 'The selected assignee or reviewer no longer exists.';
    case '23514':
      return error.message;
    case '40001':
      return 'Someone changed the participants. Reload the task and review the current shares.';
    case '42501':
      return 'You do not have permission to perform that change.';
    default:
      return error.message;
  }
}

/* -------------------------------------------------------------------------- */
/* Create                                                                     */
/* -------------------------------------------------------------------------- */

export async function createTask(
  _prevState: TaskActionState | null,
  formData: FormData,
): Promise<TaskActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };

  if (!canManageTasks(actor.profile.role)) {
    return {
      success: false,
      error: 'Only managing directors and project engineers can create tasks.',
    };
  }

  const taskTag = readString(formData, 'taskTag');
  const title = readString(formData, 'title');
  const category = readString(formData, 'category');
  const priority = readString(formData, 'priority');
  const assigneeIds = readIdList(formData, 'assigneeIds', 'assigneeId');
  const reviewerIds = readIdList(formData, 'reviewerIds', 'reviewerId');
  const dueDate = readNullableString(formData, 'dueDate');
  const taskScale = readNullableNumber(formData, 'taskScale');
  const assigneeId = assigneeIds?.[0] ?? null;

  if (taskTag === '') return { success: false, error: 'Enter a task tag.' };
  if (taskTag.length > 30) {
    return { success: false, error: 'Task tag must be 30 characters or fewer.' };
  }
  if (title === '') return { success: false, error: 'Enter a task title.' };
  if (title.length > 255) {
    return { success: false, error: 'Title must be 255 characters or fewer.' };
  }
  if (!isTaskCategory(category)) {
    return { success: false, error: 'Select a valid category.' };
  }
  if (!isTaskPriority(priority)) {
    return { success: false, error: 'Select a valid priority.' };
  }
  if (assigneeIds === null) {
    return { success: false, error: 'One or more selected assignees are invalid.' };
  }
  if (assigneeIds.length === 0 || assigneeId === null) {
    return { success: false, error: 'Select at least one assignee.' };
  }
  if (reviewerIds === null) {
    return { success: false, error: 'One or more selected reviewers are invalid.' };
  }
  if (taskScale === undefined) {
    return { success: false, error: 'Task scale must be a number.' };
  }
  if (taskScale !== null && taskScale < 0) {
    return { success: false, error: 'Task scale cannot be negative.' };
  }

  let shares: number[] | null;
  try { shares = readParticipantShares(formData, assigneeIds); }
  catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Invalid shares.' }; }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('save_task_with_participants', {
    p_task_id: null,
    p_fields: { task_tag: taskTag, title, category, priority, due_date: dueDate, task_scale: taskScale,
      description: readString(formData,'description') || null,
      template_version_id: readString(formData,'templateVersionId') || null,
      initialize_details: readString(formData,'initializationMode') !== 'manual' },
    p_assignees: assigneeIds, p_reviewers: reviewerIds, p_share_units: shares,
    p_expected_version: null,
    p_accept_legacy: formData.get('acceptLegacyShares') === 'on',
    p_operation_id: readString(formData, 'operationId') || randomUUID(),
  });
  if (error) return { success: false, error: describeDatabaseError(error) };

  revalidatePath('/tasks');
  revalidatePath('/dashboard');
  revalidatePath('/task-tools');

  return { success: true, data: { taskId: data } };
}

/* -------------------------------------------------------------------------- */
/* Full edit                                                                  */
/* -------------------------------------------------------------------------- */

export async function updateTask(
  _prevState: TaskActionState | null,
  formData: FormData,
): Promise<TaskActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };

  if (!canManageTasks(actor.profile.role)) {
    return {
      success: false,
      error:
        'Only managing directors and project engineers can edit task details.',
    };
  }

  const versionText = readString(formData, 'participantVersion');
  if (!/^\d+$/.test(versionText) || !Number.isSafeInteger(Number(versionText))) return { success: false, error: 'Reload the task before editing its participants.' };
  const taskId = readString(formData, 'taskId');
  if (taskId === '') return { success: false, error: 'Missing task reference.' };

  const taskTag = readString(formData, 'taskTag');
  const title = readString(formData, 'title');
  const category = readString(formData, 'category');
  const priority = readString(formData, 'priority');
  const assigneeIds = readIdList(formData, 'assigneeIds', 'assigneeId');
  const reviewerIds = readIdList(formData, 'reviewerIds', 'reviewerId');
  const dueDate = readNullableString(formData, 'dueDate');
  const taskScale = readNullableNumber(formData, 'taskScale');
  const assigneeId = assigneeIds?.[0] ?? null;

  if (taskTag === '') return { success: false, error: 'Enter a task tag.' };
  if (taskTag.length > 30) {
    return { success: false, error: 'Task tag must be 30 characters or fewer.' };
  }
  if (title === '') return { success: false, error: 'Enter a task title.' };
  if (title.length > 255) {
    return { success: false, error: 'Title must be 255 characters or fewer.' };
  }
  if (!isTaskCategory(category)) {
    return { success: false, error: 'Select a valid category.' };
  }
  if (!isTaskPriority(priority)) {
    return { success: false, error: 'Select a valid priority.' };
  }
  if (assigneeIds === null) {
    return { success: false, error: 'One or more selected assignees are invalid.' };
  }
  if (assigneeIds.length === 0 || assigneeId === null) {
    return { success: false, error: 'Select at least one assignee.' };
  }
  if (reviewerIds === null) {
    return { success: false, error: 'One or more selected reviewers are invalid.' };
  }
  if (taskScale === undefined) {
    return { success: false, error: 'Task scale must be a number.' };
  }
  if (taskScale !== null && taskScale < 0) {
    return { success: false, error: 'Task scale cannot be negative.' };
  }

  let shares: number[] | null;
  try { shares = readParticipantShares(formData, assigneeIds); }
  catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Invalid shares.' }; }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('save_task_with_participants', {
    p_task_id: taskId,
    p_fields: { task_tag: taskTag, title, category, priority, due_date: dueDate, expected_lifecycle_version: Number(readString(formData, "lifecycleVersion")) },
    p_assignees: assigneeIds, p_reviewers: reviewerIds, p_share_units: shares,
    p_expected_version: Number(versionText),
    p_accept_legacy: formData.get('acceptLegacyShares') === 'on',
    p_operation_id: readString(formData, 'operationId') || randomUUID(),
  });
  if (error) return { success: false, error: describeDatabaseError(error) };

  revalidatePath('/tasks');
  revalidatePath('/dashboard');

  return { success: true, data: { taskId } };
}

/* -------------------------------------------------------------------------- */
/* Inline status                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Checks that the actor may change status or progress on a given task.
 *
 * Managers may act on anything. Everyone else must be the assignee, which
 * requires reading the row first — the SELECT policy lets any authenticated
 * member see every task, so this read succeeds even when the write would not.
 */
async function assertCanUpdateOwnFields(
  profile: User,
  taskId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (canManageTasks(profile.role)) return { ok: true };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tasks')
    .select('assignee_id')
    .eq('id', taskId)
    .maybeSingle();

  if (error) return { ok: false, error: describeDatabaseError(error) };
  if (!data) return { ok: false, error: 'That task no longer exists.' };

  if (data.assignee_id === profile.id) {
    return { ok: true };
  }

  const { data: assignment, error: assignmentError } = await supabase
    .from('task_assignees')
    .select('id')
    .eq('task_id', taskId)
    .eq('user_id', profile.id)
    .maybeSingle();

  if (assignmentError) {
    return { ok: false, error: describeDatabaseError(assignmentError) };
  }

  if (!assignment) {
    return {
      ok: false,
      error: 'You can only update tasks assigned to you.',
    };
  }

  return { ok: true };
}

async function taskCommand(taskId: string, command: string, payload: Json, version: number | undefined, operationId: string | undefined): Promise<TaskActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  if (!UUID_PATTERN.test(taskId) || !operationId || !UUID_PATTERN.test(operationId) || version === undefined || !Number.isSafeInteger(version) || version < 0) return { success: false, error: 'Reload the task before submitting this change.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('task_lifecycle_command', {p_task_id:taskId,p_command:command,p_payload:payload,p_expected_version:version,p_operation_id:operationId});
  if (error) return { ...executionError(error), data: undefined };
  revalidatePath('/tasks'); revalidatePath('/tasks','layout'); revalidatePath('/dashboard'); revalidatePath('/task-tools');
  return { success:true,data:{taskId} };
}
export async function updateTaskStatus(taskId: string,status: TaskStatus,version?: number,operationId?: string,reason?: string): Promise<TaskActionState> {
  if (!isTaskStatus(status)) return {success:false,error:'Unrecognised status.'};
  return taskCommand(taskId,'transition',{status,reason:reason ?? null},version,operationId);
}
export async function updateTaskProgress(taskId: string,progressPercentage: number,version?: number,operationId?: string): Promise<TaskActionState> {
  return taskCommand(taskId,'progress',{progress:progressPercentage},version,operationId);
}
export async function changeTaskLifecycle(_previous: TaskActionState | null, formData: FormData): Promise<TaskActionState> {
  const identity=commandIdentity(formData), command=readString(formData,'command');
  if (!identity.operationId || identity.version===null || !['transition','scale','review'].includes(command)) return {success:false,error:'Invalid task command; reload and retry.'};
  let payload: Json;
  if (command==='transition') payload={status:readString(formData,'status'),reason:readString(formData,'reason')};
  else if (command==='review') payload={approved:readString(formData,'approved')==='true'};
  else {
    const mode=readString(formData,'mode');
    const required=mode==='manual'?['value']:mode==='hours'?['multiplier']:mode==='activity_count'?['activityCount','unitScale']:['percentage'];
    if(required.some(key=>readString(formData,key)==='')) return {success:false,error:'Enter the required scale inputs; blank values are unmeasured.'};
    let sourceId=readString(formData,'sourceTaskId');
    if (mode==='linked' && !sourceId) { const db=await createClient(); const found=await db.from('tasks').select('id').eq('task_tag',readString(formData,'sourceTaskTag')).maybeSingle(); if(found.error || !found.data) return {success:false,error:'Source task tag was not found.'}; sourceId=found.data.id; }
    const inputs=mode==='manual' ? {value:Number(readString(formData,'value'))} : mode==='hours' ? {multiplier:Number(readString(formData,'multiplier'))}
      : mode==='activity_count' ? {activity_count:Number(readString(formData,'activityCount')),unit_scale:Number(readString(formData,'unitScale'))}
      : {source_task_id:sourceId,percentage:Number(readString(formData,'percentage'))};
    const rawOverride=readString(formData,'override');
    payload={mode,inputs,override:rawOverride===''?null:Number(rawOverride),reason:readString(formData,'reason'),provenance:readString(formData,'provenance')};
    if (Object.values(inputs).some(v=>typeof v==='number' && !Number.isFinite(v)) || (rawOverride!=='' && !Number.isFinite(Number(rawOverride)))) return {success:false,error:'Scale inputs must be finite numbers.'};
  }
  return taskCommand(readString(formData,'taskId'),command,payload,identity.version,identity.operationId);
}

/* -------------------------------------------------------------------------- */
/* Delete                                                                     */
/* -------------------------------------------------------------------------- */

export async function deleteTask(taskId: string): Promise<TaskActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };

  if (!canManageTasks(actor.profile.role)) {
    return {
      success: false,
      error: 'Only managing directors and project engineers can delete tasks.',
    };
  }

  if (taskId === '') return { success: false, error: 'Missing task reference.' };

  const supabase = await createClient();

  // daily_task_logs cascades on task deletion, so this also discards the effort
  // history. Consider setting status to 'Discarded' instead when the logged
  // hours still matter for past months.
  const { error } = await supabase.from('tasks').delete().eq('id', taskId);

  if (error) {
    return { success: false, error: describeDatabaseError(error) };
  }

  revalidatePath('/tasks');
  revalidatePath('/dashboard');

  return { success: true, data: { taskId } };
}

export async function recordTaskReview(previous: TaskActionState | null, formData: FormData): Promise<TaskActionState> {
 formData.set('command','review');
 if (!['true','false'].includes(readString(formData,'approved'))) return {success:false,error:'Choose a review decision.'};
 return changeTaskLifecycle(previous,formData);
}
