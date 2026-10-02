'use server';

import { revalidatePath } from 'next/cache';
import type { PostgrestError } from '@supabase/supabase-js';

import { getCurrentProfile } from '@/lib/auth/profile';
import {
  applyProgressDelta,
  computeProductivity,
  computeScaledProgress,
  isMetricsEligible,
  sumHours,
} from '@/lib/logs/metrics';
import { recalculateTaskMetrics as recalculateTaskMetricsForTask } from '@/lib/logs/task-metrics';
import { getLoggableTasksFor } from '@/lib/logs/queries';
import { createClient } from '@/lib/supabase/server';
import { TASK_MANAGER_ROLES } from '@/lib/tracker/enums';
import type { ActionResponse, Task, User, UserRole } from '@/types/tracker';

/**
 * Daily effort log Server Actions.
 *
 * Every write is followed by a recalculation of the parent task's
 * `progress_percentage`, `task_productivity` and `valid_for_metrics`, per
 * `domain-rules.md`.
 *
 * As in the task actions, authorisation is checked here for a useful error
 * message and enforced again by RLS, which is the real boundary.
 */

export type LogActionState = ActionResponse<{ logId: string }>;

/** Single-entry sanity ceiling. The column itself permits up to 999.99. */
const MAX_HOURS_PER_ENTRY = 24;
const MAX_RAW_LINKS = 10;

/**
 * Days into the future a log date may carry.
 *
 * One day of slack, not zero, because "today" is evaluated on the server in UTC.
 * A user in UTC+13 filing an entry on their local morning would otherwise be
 * told their own current date is in the future.
 */
const FUTURE_DATE_GRACE_DAYS = 1;

/* -------------------------------------------------------------------------- */
/* Actor                                                                      */
/* -------------------------------------------------------------------------- */

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

function readNullableString(formData: FormData, key: string): string | null {
  const value = readString(formData, key);
  return value === '' ? null : value;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function readId(formData: FormData, key: string): string | null {
  const value = readString(formData, key);
  return UUID_PATTERN.test(value) ? value : null;
}

/** `undefined` signals present-but-unparseable, distinct from blank. */
function readNumber(
  formData: FormData,
  key: string,
): number | null | undefined {
  const raw = readString(formData, key);
  if (raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function isWithinFutureGrace(isoDate: string): boolean {
  const limit = new Date();
  limit.setUTCDate(limit.getUTCDate() + FUTURE_DATE_GRACE_DAYS);
  return isoDate <= limit.toISOString().slice(0, 10);
}

/**
 * Collects the repeated `rawLinks` fields into a clean array.
 *
 * Only http and https survive. Rejecting other schemes here matters because
 * these values are rendered as anchors in the history view, and `javascript:`
 * in an href is a stored cross-site-scripting vector.
 */
function readRawLinks(formData: FormData): string[] | null | undefined {
  const values = formData
    .getAll('rawLinks')
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');

  if (values.length === 0) return null;
  if (values.length > MAX_RAW_LINKS) return undefined;

  for (const value of values) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return undefined;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return undefined;
    }
  }

  return values;
}

/* -------------------------------------------------------------------------- */
/* Error translation                                                          */
/* -------------------------------------------------------------------------- */

function describeDatabaseError(error: PostgrestError): string {
  switch (error.code) {
    case '23503':
      return 'That task no longer exists.';
    case '23514':
      return 'A value is outside its permitted range.';
    case '42501':
      return 'You do not have permission to perform that change.';
    default:
      return error.message;
  }
}

/* -------------------------------------------------------------------------- */
/* Validated form payload                                                     */
/* -------------------------------------------------------------------------- */

interface LogInput {
  taskId: string;
  logDate: string;
  hoursWorked: number;
  progressDelta: number;
  updateNotes: string | null;
  rawLinks: string[] | null;
}

function parseLogInput(
  formData: FormData,
): { ok: true; input: LogInput } | { ok: false; error: string } {
  const taskId = readId(formData, 'taskId');
  if (taskId === null) return { ok: false, error: 'Select a task to log against.' };

  const logDate = readString(formData, 'logDate') || todayIso();
  if (!ISO_DATE_PATTERN.test(logDate)) {
    return { ok: false, error: 'Enter a valid log date.' };
  }
  if (!isWithinFutureGrace(logDate)) {
    return { ok: false, error: 'Log date cannot be in the future.' };
  }

  const hoursWorked = readNumber(formData, 'hoursWorked');
  if (hoursWorked === undefined) {
    return { ok: false, error: 'Hours worked must be a number.' };
  }
  if (hoursWorked === null) {
    return { ok: false, error: 'Enter the hours worked.' };
  }
  if (hoursWorked < 0) {
    return { ok: false, error: 'Hours worked cannot be negative.' };
  }
  if (hoursWorked > MAX_HOURS_PER_ENTRY) {
    return {
      ok: false,
      error: `A single entry cannot exceed ${MAX_HOURS_PER_ENTRY} hours.`,
    };
  }

  const progressDeltaRaw = readNumber(formData, 'progressDelta');
  if (progressDeltaRaw === undefined) {
    return { ok: false, error: 'Progress added must be a number.' };
  }
  const progressDelta = progressDeltaRaw ?? 0;
  if (progressDelta < -100 || progressDelta > 100) {
    return {
      ok: false,
      error: 'Progress added must be between -100 and 100.',
    };
  }

  const rawLinks = readRawLinks(formData);
  if (rawLinks === undefined) {
    return {
      ok: false,
      error: `Links must be valid http or https URLs, up to ${MAX_RAW_LINKS} of them.`,
    };
  }

  return {
    ok: true,
    input: {
      taskId,
      logDate,
      hoursWorked,
      progressDelta,
      updateNotes: readNullableString(formData, 'updateNotes'),
      rawLinks,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Task metric recalculation                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Recomputes a task's derived metrics after its logs change.
 *
 *   progress_percentage  current value plus `progressDelta`, clamped to 0-100
 *   task_productivity    scaled progress divided by total logged hours
 *   valid_for_metrics    hours > 0 AND scale > 0 AND category is not OT
 *   freshness            reset to Fresh, since the task was just worked on
 *
 * `scaled_progress` is never written: it is GENERATED ALWAYS, so PostgreSQL
 * recomputes it from the new `progress_percentage` on its own. The value is
 * mirrored in application code purely as the numerator for productivity.
 *
 * Progress is applied as a delta rather than rederived from the sum of all log
 * deltas, so that manual edits made in the task grid survive.
 *
 * Caveat: this is read-then-write, not a single atomic statement. Two logs filed
 * against one task in the same instant could interleave and lose one delta. A
 * `SET progress_percentage = progress_percentage + $1` statement would close
 * that window, which PostgREST cannot express and would need an RPC.
 */
async function recalculateTaskMetrics(
  taskId: string,
  progressDelta: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  return recalculateTaskMetricsForTask(supabase, taskId, progressDelta);
}

/**
 * Confirms the actor may log effort against a task.
 *
 * Restricted to an assignee, or a manager. This must match the UPDATE policy on
 * `tasks`: the recalculation writes to the task row, so anyone allowed to log
 * here also has to be allowed to update there, or the log would be saved and the
 * metrics would silently fail to follow.
 */
async function resolveLoggableTask(
  profile: User,
  taskId: string,
): Promise<
  { ok: true; task: Pick<Task, 'id' | 'assigneeId'> } | { ok: false; error: string }
> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('tasks')
    .select('id, assignee_id')
    .eq('id', taskId)
    .maybeSingle();

  if (error) return { ok: false, error: describeDatabaseError(error) };
  if (!data) return { ok: false, error: 'That task no longer exists.' };

  if (isTaskManager(profile.role) || data.assignee_id === profile.id) {
    return { ok: true, task: { id: data.id, assigneeId: data.assignee_id } };
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
      error: 'You can only log effort against tasks assigned to you.',
    };
  }

  return { ok: true, task: { id: data.id, assigneeId: data.assignee_id } };
}

function revalidateAffected(): void {
  revalidatePath('/logs');
  revalidatePath('/tasks');
  revalidatePath('/dashboard');
}

/* -------------------------------------------------------------------------- */
/* Create                                                                     */
/* -------------------------------------------------------------------------- */

export async function createTaskLog(
  _prevState: LogActionState | null,
  formData: FormData,
): Promise<LogActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };

  const parsed = parseLogInput(formData);
  if (!parsed.ok) return { success: false, error: parsed.error };

  const permitted = await resolveLoggableTask(actor.profile, parsed.input.taskId);
  if (!permitted.ok) return { success: false, error: permitted.error };

  const supabase = await createClient();

  // user_id comes from the verified session, never from the form. Accepting it
  // from the client would let anyone file effort under another member's name.
  const { data, error } = await supabase
    .from('daily_task_logs')
    .insert({
      task_id: parsed.input.taskId,
      user_id: actor.profile.id,
      log_date: parsed.input.logDate,
      hours_worked: parsed.input.hoursWorked,
      progress_delta: parsed.input.progressDelta,
      update_notes: parsed.input.updateNotes,
      raw_links: parsed.input.rawLinks,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: describeDatabaseError(error) };

  const recalculated = await recalculateTaskMetrics(
    parsed.input.taskId,
    parsed.input.progressDelta,
  );
  if (!recalculated.ok) {
    // The log is saved; only the derived metrics are behind. Say so rather than
    // implying the entry was lost.
    return {
      success: false,
      error: `Log saved, but task metrics could not be updated: ${recalculated.error}`,
    };
  }

  revalidateAffected();

  return { success: true, data: { logId: data.id } };
}

/* -------------------------------------------------------------------------- */
/* Update                                                                     */
/* -------------------------------------------------------------------------- */

export async function updateTaskLog(
  _prevState: LogActionState | null,
  formData: FormData,
): Promise<LogActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };

  const logId = readId(formData, 'logId');
  if (logId === null) return { success: false, error: 'Missing log reference.' };

  const parsed = parseLogInput(formData);
  if (!parsed.ok) return { success: false, error: parsed.error };

  const supabase = await createClient();

  const { data: existing, error: readError } = await supabase
    .from('daily_task_logs')
    .select('id, user_id, task_id, progress_delta')
    .eq('id', logId)
    .maybeSingle();

  if (readError) {
    return { success: false, error: describeDatabaseError(readError) };
  }
  if (!existing) return { success: false, error: 'That log no longer exists.' };

  if (existing.user_id !== actor.profile.id) {
    return { success: false, error: 'You can only edit your own logs.' };
  }

  const permitted = await resolveLoggableTask(actor.profile, parsed.input.taskId);
  if (!permitted.ok) return { success: false, error: permitted.error };

  const { error } = await supabase
    .from('daily_task_logs')
    .update({
      task_id: parsed.input.taskId,
      log_date: parsed.input.logDate,
      hours_worked: parsed.input.hoursWorked,
      progress_delta: parsed.input.progressDelta,
      update_notes: parsed.input.updateNotes,
      raw_links: parsed.input.rawLinks,
    })
    .eq('id', logId);

  if (error) return { success: false, error: describeDatabaseError(error) };

  const previousDelta = existing.progress_delta ?? 0;
  const movedTask = existing.task_id !== parsed.input.taskId;

  if (movedTask) {
    // Reassigned to another task: back the old delta out of the previous task
    // and apply the new one to the new task.
    const oldTask = await recalculateTaskMetrics(existing.task_id, -previousDelta);
    if (!oldTask.ok) {
      return {
        success: false,
        error: `Log updated, but the previous task's metrics could not be updated: ${oldTask.error}`,
      };
    }

    const newTask = await recalculateTaskMetrics(
      parsed.input.taskId,
      parsed.input.progressDelta,
    );
    if (!newTask.ok) {
      return {
        success: false,
        error: `Log updated, but task metrics could not be updated: ${newTask.error}`,
      };
    }
  } else {
    // Same task: apply only the difference, so editing 5 to 8 moves progress by
    // 3 rather than by another 8.
    const recalculated = await recalculateTaskMetrics(
      parsed.input.taskId,
      parsed.input.progressDelta - previousDelta,
    );
    if (!recalculated.ok) {
      return {
        success: false,
        error: `Log updated, but task metrics could not be updated: ${recalculated.error}`,
      };
    }
  }

  revalidateAffected();

  return { success: true, data: { logId } };
}

/* -------------------------------------------------------------------------- */
/* Delete                                                                     */
/* -------------------------------------------------------------------------- */

export async function deleteTaskLog(logId: string): Promise<LogActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };

  if (!UUID_PATTERN.test(logId)) {
    return { success: false, error: 'Missing log reference.' };
  }

  const supabase = await createClient();

  const { data: existing, error: readError } = await supabase
    .from('daily_task_logs')
    .select('id, user_id, task_id, progress_delta')
    .eq('id', logId)
    .maybeSingle();

  if (readError) {
    return { success: false, error: describeDatabaseError(readError) };
  }
  if (!existing) return { success: false, error: 'That log no longer exists.' };

  if (existing.user_id !== actor.profile.id) {
    return { success: false, error: 'You can only delete your own logs.' };
  }

  const { error } = await supabase
    .from('daily_task_logs')
    .delete()
    .eq('id', logId);

  if (error) return { success: false, error: describeDatabaseError(error) };

  // Withdraw the progress this entry had contributed.
  const recalculated = await recalculateTaskMetrics(
    existing.task_id,
    -(existing.progress_delta ?? 0),
  );
  if (!recalculated.ok) {
    return {
      success: false,
      error: `Log deleted, but task metrics could not be updated: ${recalculated.error}`,
    };
  }

  revalidateAffected();

  return { success: true, data: { logId } };
}

/* -------------------------------------------------------------------------- */
/* Drawer data                                                                */
/* -------------------------------------------------------------------------- */

export interface LoggableTaskOption {
  id: string;
  taskTag: string;
  title: string;
  /** Current progress, so the drawer can preview where the delta lands. */
  progressPercentage: number | null;
  /** Current scale, for the scaled-progress preview. */
  taskScale: number | null;
}

/**
 * Supplies the drawer's task picker.
 *
 * Exposed as an action so the list is fetched when the drawer first opens,
 * instead of on every workspace page render just because the global FAB is
 * mounted there.
 */
export async function loadLoggableTasks(): Promise<
  ActionResponse<LoggableTaskOption[]>
> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };

  try {
    const tasks = await getLoggableTasksFor(actor.profile.id);
    return {
      success: true,
      data: tasks.map((task) => ({
        id: task.id,
        taskTag: task.taskTag,
        title: task.title,
        progressPercentage: task.progressPercentage,
        taskScale: task.taskScale,
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Could not load tasks.',
    };
  }
}
