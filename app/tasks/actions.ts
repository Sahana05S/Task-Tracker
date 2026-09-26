'use server';

import { revalidatePath } from 'next/cache';
import type { PostgrestError } from '@supabase/supabase-js';

import { getCurrentProfile } from '@/lib/auth/profile';
import { createClient } from '@/lib/supabase/server';
import {
  isTaskCategory,
  isTaskPriority,
  isTaskStatus,
  TASK_MANAGER_ROLES,
} from '@/lib/tracker/enums';
import type { ActionResponse, TaskStatus, User, UserRole } from '@/types/tracker';

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

function isTaskManager(role: UserRole): boolean {
  return (TASK_MANAGER_ROLES as readonly UserRole[]).includes(role);
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
      return 'A value is outside its permitted range.';
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

  if (!isTaskManager(actor.profile.role)) {
    return {
      success: false,
      error: 'Only managing directors and project engineers can create tasks.',
    };
  }

  const taskTag = readString(formData, 'taskTag');
  const title = readString(formData, 'title');
  const category = readString(formData, 'category');
  const priority = readString(formData, 'priority');
  const assigneeId = readRequiredId(formData, 'assigneeId');
  const reviewerId = readOptionalId(formData, 'reviewerId');
  const dueDate = readNullableString(formData, 'dueDate');
  const taskScale = readNullableNumber(formData, 'taskScale');

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
  if (assigneeId === null) {
    return { success: false, error: 'Select an assignee.' };
  }
  if (reviewerId === undefined) {
    return { success: false, error: 'The selected reviewer is not valid.' };
  }
  if (taskScale === undefined) {
    return { success: false, error: 'Task scale must be a number.' };
  }
  if (taskScale !== null && taskScale < 0) {
    return { success: false, error: 'Task scale cannot be negative.' };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      task_tag: taskTag,
      title,
      category,
      priority,
      assignee_id: assigneeId,
      reviewer_id: reviewerId,
      due_date: dueDate,
      task_scale: taskScale,
      // `scaled_progress` is omitted deliberately: it is GENERATED ALWAYS and
      // PostgreSQL rejects any write that targets it.
      //
      // Metrics eligibility, per domain-rules.md, needs hours logged > 0 AND
      // scale > 0, and excludes off-hours entries. Only the static half is
      // knowable at creation, so apply that and let the Phase 4 logger promote
      // the task once hours exist.
      valid_for_metrics:
        taskScale !== null && taskScale > 0 && category !== 'OT',
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, error: describeDatabaseError(error) };
  }

  revalidatePath('/tasks');
  revalidatePath('/dashboard');

  return { success: true, data: { taskId: data.id } };
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

  if (!isTaskManager(actor.profile.role)) {
    return {
      success: false,
      error:
        'Only managing directors and project engineers can edit task details.',
    };
  }

  const taskId = readString(formData, 'taskId');
  if (taskId === '') return { success: false, error: 'Missing task reference.' };

  const taskTag = readString(formData, 'taskTag');
  const title = readString(formData, 'title');
  const category = readString(formData, 'category');
  const priority = readString(formData, 'priority');
  const assigneeId = readRequiredId(formData, 'assigneeId');
  const reviewerId = readOptionalId(formData, 'reviewerId');
  const dueDate = readNullableString(formData, 'dueDate');
  const taskScale = readNullableNumber(formData, 'taskScale');

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
  if (assigneeId === null) {
    return { success: false, error: 'Select an assignee.' };
  }
  if (reviewerId === undefined) {
    return { success: false, error: 'The selected reviewer is not valid.' };
  }
  if (taskScale === undefined) {
    return { success: false, error: 'Task scale must be a number.' };
  }
  if (taskScale !== null && taskScale < 0) {
    return { success: false, error: 'Task scale cannot be negative.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('tasks')
    .update({
      task_tag: taskTag,
      title,
      category,
      priority,
      assignee_id: assigneeId,
      reviewer_id: reviewerId,
      due_date: dueDate,
      task_scale: taskScale,
      valid_for_metrics:
        taskScale !== null && taskScale > 0 && category !== 'OT',
    })
    .eq('id', taskId);

  if (error) {
    return { success: false, error: describeDatabaseError(error) };
  }

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
  if (isTaskManager(profile.role)) return { ok: true };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tasks')
    .select('assignee_id')
    .eq('id', taskId)
    .maybeSingle();

  if (error) return { ok: false, error: describeDatabaseError(error) };
  if (!data) return { ok: false, error: 'That task no longer exists.' };

  if (data.assignee_id !== profile.id) {
    return {
      ok: false,
      error: 'You can only update tasks assigned to you.',
    };
  }

  return { ok: true };
}

export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
): Promise<TaskActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };

  if (!isTaskStatus(status)) {
    return { success: false, error: 'Unrecognised status.' };
  }

  const permitted = await assertCanUpdateOwnFields(actor.profile, taskId);
  if (!permitted.ok) return { success: false, error: permitted.error };

  const supabase = await createClient();

  // Completion bookkeeping. The schema carries completed_date and met_deadline
  // but nothing else populates them, and the deadline-compliance reporting in
  // product-requirements.md depends on both.
  //
  // Progress is deliberately left alone: forcing it to 100 on Done would
  // overwrite a real measurement with an assumption.
  let completedDate: string | null = null;
  let metDeadline: boolean | null = null;

  if (status === 'Done') {
    const { data: existing, error: readError } = await supabase
      .from('tasks')
      .select('due_date')
      .eq('id', taskId)
      .maybeSingle();

    if (readError) {
      return { success: false, error: describeDatabaseError(readError) };
    }
    if (!existing) {
      return { success: false, error: 'That task no longer exists.' };
    }

    completedDate = todayIso();
    // Null when undated: an absent deadline cannot be met or missed.
    metDeadline =
      existing.due_date === null ? null : completedDate <= existing.due_date;
  }

  const { error } = await supabase
    .from('tasks')
    .update({
      status,
      completed_date: completedDate,
      met_deadline: metDeadline,
    })
    .eq('id', taskId);

  if (error) {
    return { success: false, error: describeDatabaseError(error) };
  }

  revalidatePath('/tasks');
  revalidatePath('/dashboard');

  return { success: true, data: { taskId } };
}

/* -------------------------------------------------------------------------- */
/* Inline progress                                                            */
/* -------------------------------------------------------------------------- */

export async function updateTaskProgress(
  taskId: string,
  progressPercentage: number,
): Promise<TaskActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };

  if (!Number.isFinite(progressPercentage)) {
    return { success: false, error: 'Progress must be a number.' };
  }
  if (progressPercentage < 0 || progressPercentage > 100) {
    return { success: false, error: 'Progress must be between 0 and 100.' };
  }

  const permitted = await assertCanUpdateOwnFields(actor.profile, taskId);
  if (!permitted.ok) return { success: false, error: permitted.error };

  const supabase = await createClient();

  // Only progress_percentage is written. scaled_progress is a generated STORED
  // column, so PostgreSQL recomputes task_scale * (progress / 100) itself.
  const { error } = await supabase
    .from('tasks')
    .update({ progress_percentage: progressPercentage })
    .eq('id', taskId);

  if (error) {
    return { success: false, error: describeDatabaseError(error) };
  }

  revalidatePath('/tasks');
  revalidatePath('/dashboard');

  return { success: true, data: { taskId } };
}

/* -------------------------------------------------------------------------- */
/* Delete                                                                     */
/* -------------------------------------------------------------------------- */

export async function deleteTask(taskId: string): Promise<TaskActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };

  if (!isTaskManager(actor.profile.role)) {
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
