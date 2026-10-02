'use server';

import { revalidatePath } from 'next/cache';
import type { PostgrestError } from '@supabase/supabase-js';

import { getCurrentProfile } from '@/lib/auth/profile';
import { recalculateTaskMetrics } from '@/lib/logs/task-metrics';
import { createClient } from '@/lib/supabase/server';
import { normalizeTaskTagParam } from '@/lib/tasks/detail';
import { canManageTasks } from '@/lib/tasks/permissions';
import { createTimerLogDraft } from '@/lib/timers/logging';
import {
  canManageTimerRecord,
  canStartTimerForTask,
} from '@/lib/timers/permissions';
import type { ActionResponse, Task, TaskTimer, User } from '@/types/tracker';

export type TimerActionState = ActionResponse<{
  timerId?: string;
  logId?: string;
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

function readOptionalString(formData: FormData, key: string): string | null {
  const value = readString(formData, key);
  return value === '' ? null : value;
}

function readTimerId(formData: FormData): string | null {
  const value = readString(formData, 'timerId');
  return UUID_PATTERN.test(value) ? value : null;
}

function readHours(formData: FormData): number | null | undefined {
  const raw = readString(formData, 'hoursWorked');
  if (raw === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function describeDatabaseError(error: PostgrestError): string {
  switch (error.code) {
    case '23503':
      return 'A referenced task or timer no longer exists.';
    case '23505':
      return 'You already have a running timer. Stop it before starting another.';
    case '23514':
      return 'A timer or log value is outside its permitted range.';
    case '42501':
      return 'You do not have permission to perform that change.';
    default:
      return error.message;
  }
}

async function resolveTaskByTag(
  supabase: SupabaseServerClient,
  rawTaskTag: string,
): Promise<
  | { ok: true; task: Pick<Task, 'id' | 'taskTag' | 'title' | 'assigneeId' | 'assigneeIds' | 'status'> }
  | { ok: false; error: string }
> {
  const taskTag = normalizeTaskTagParam(rawTaskTag);
  if (!taskTag) return { ok: false, error: 'Missing task reference.' };

  const { data: taskRow, error: taskError } = await supabase
    .from('tasks')
    .select('id, task_tag, title, assignee_id, status')
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

  return {
    ok: true,
    task: {
      id: taskRow.id,
      taskTag: taskRow.task_tag,
      title: taskRow.title,
      assigneeId: taskRow.assignee_id,
      assigneeIds: assigneeRows.map((row) => row.user_id),
      status: taskRow.status,
    },
  };
}

function revalidateTimerViews(taskTag: string): void {
  const encodedTaskTag = encodeURIComponent(taskTag);
  revalidatePath(`/tasks/${encodedTaskTag}`);
  revalidatePath(`/tasks/${encodedTaskTag}/checklist`);
  revalidatePath('/tasks');
  revalidatePath('/logs');
  revalidatePath('/dashboard');
}

export async function startTaskTimer(
  formData: FormData,
): Promise<TimerActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };

  const supabase = await createClient();
  const taskResult = await resolveTaskByTag(supabase, readString(formData, 'taskTag'));
  if (!taskResult.ok) return { success: false, error: taskResult.error };

  if (!canStartTimerForTask(actor.profile, taskResult.task)) {
    return {
      success: false,
      error: 'You can only start timers on active tasks assigned to you.',
    };
  }

  const { data: activeTimer, error: activeError } = await supabase
    .from('task_timers')
    .select('id')
    .eq('user_id', actor.profile.id)
    .eq('status', 'Running')
    .maybeSingle();

  if (activeError) {
    return { success: false, error: describeDatabaseError(activeError) };
  }
  if (activeTimer) {
    return {
      success: false,
      error: 'You already have a running timer. Stop it before starting another.',
    };
  }

  const { data, error } = await supabase
    .from('task_timers')
    .insert({
      task_id: taskResult.task.id,
      user_id: actor.profile.id,
      status: 'Running',
      notes: readOptionalString(formData, 'notes'),
    })
    .select('id')
    .single();

  if (error) return { success: false, error: describeDatabaseError(error) };

  revalidateTimerViews(taskResult.task.taskTag);
  return { success: true, data: { timerId: data.id } };
}

export async function stopTaskTimer(
  formData: FormData,
): Promise<TimerActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };

  const timerId = readTimerId(formData);
  if (!timerId) return { success: false, error: 'Missing timer reference.' };

  const supabase = await createClient();
  const { data: timerRow, error: timerError } = await supabase
    .from('task_timers')
    .select('id, task_id, user_id, status, started_at, stopped_at, elapsed_seconds, generated_log_id, notes, created_at, updated_at')
    .eq('id', timerId)
    .maybeSingle();

  if (timerError) return { success: false, error: describeDatabaseError(timerError) };
  if (!timerRow) return { success: false, error: 'That timer no longer exists.' };
  if (timerRow.status !== 'Running') {
    return { success: false, error: 'That timer is not running.' };
  }
  const timer = mapTimerForPermission(timerRow);
  if (!canManageTimerRecord(actor.profile, timer)) {
    return {
      success: false,
      error: 'You can only stop your own timer.',
    };
  }

  const { data: taskRow, error: taskError } = await supabase
    .from('tasks')
    .select('task_tag')
    .eq('id', timerRow.task_id)
    .maybeSingle();

  if (taskError) return { success: false, error: describeDatabaseError(taskError) };
  if (!taskRow) return { success: false, error: 'That task no longer exists.' };

  const stoppedAt = new Date();
  const draft = createTimerLogDraft({
    startedAt: new Date(timerRow.started_at),
    stoppedAt,
    notes: readOptionalString(formData, 'notes') ?? timerRow.notes,
  });

  const { data: logRow, error: logError } = await supabase
    .from('daily_task_logs')
    .insert({
      task_id: timerRow.task_id,
      user_id: timerRow.user_id,
      log_date: draft.logDate,
      hours_worked: draft.hoursWorked,
      progress_delta: 0,
      update_notes: draft.updateNotes,
      raw_links: null,
      log_source: 'Timer',
      source_timer_id: timerRow.id,
    })
    .select('id')
    .single();

  if (logError) return { success: false, error: describeDatabaseError(logError) };

  const { error: updateError } = await supabase
    .from('task_timers')
    .update({
      status: 'Stopped',
      stopped_at: stoppedAt.toISOString(),
      elapsed_seconds: draft.elapsedSeconds,
      generated_log_id: logRow.id,
      notes: draft.updateNotes,
    })
    .eq('id', timerRow.id);

  if (updateError) {
    return {
      success: false,
      error: `Log created, but timer could not be stopped: ${describeDatabaseError(updateError)}`,
    };
  }

  const recalculated = await recalculateTaskMetrics(supabase, timerRow.task_id, 0);
  if (!recalculated.ok) {
    return {
      success: false,
      error: `Timer stopped, but task metrics could not be updated: ${recalculated.error}`,
    };
  }

  revalidateTimerViews(taskRow.task_tag);
  return {
    success: true,
    data: { timerId: timerRow.id, logId: logRow.id },
  };
}

export async function discardTaskTimer(
  formData: FormData,
): Promise<TimerActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };

  const timerId = readTimerId(formData);
  if (!timerId) return { success: false, error: 'Missing timer reference.' };

  const supabase = await createClient();
  const { data: timerRow, error: timerError } = await supabase
    .from('task_timers')
    .select('id, task_id, user_id, status')
    .eq('id', timerId)
    .maybeSingle();

  if (timerError) return { success: false, error: describeDatabaseError(timerError) };
  if (!timerRow) return { success: false, error: 'That timer no longer exists.' };

  if (!canManageTimerRecord(actor.profile, { userId: timerRow.user_id })) {
    return {
      success: false,
      error: 'You can only discard your own timer.',
    };
  }

  const stoppedAt = new Date();
  const { error } = await supabase
    .from('task_timers')
    .update({
      status: 'Discarded',
      stopped_at: stoppedAt.toISOString(),
      notes: readOptionalString(formData, 'notes') ?? 'Timer discarded.',
    })
    .eq('id', timerId);

  if (error) return { success: false, error: describeDatabaseError(error) };

  const taskTag = normalizeTaskTagParam(readString(formData, 'taskTag'));
  if (taskTag) revalidateTimerViews(taskTag);

  return { success: true, data: { timerId } };
}

export async function enterManualTaskTime(
  formData: FormData,
): Promise<TimerActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };

  const supabase = await createClient();
  const taskResult = await resolveTaskByTag(supabase, readString(formData, 'taskTag'));
  if (!taskResult.ok) return { success: false, error: taskResult.error };
  if (!canStartTimerForTask(actor.profile, taskResult.task)) {
    return {
      success: false,
      error: 'You can only enter time on active tasks assigned to you.',
    };
  }

  const hoursWorked = readHours(formData);
  if (hoursWorked === undefined || hoursWorked === null) {
    return { success: false, error: 'Enter hours worked.' };
  }
  if (hoursWorked < 0 || hoursWorked > 24) {
    return { success: false, error: 'Hours worked must be between 0 and 24.' };
  }

  const progressDeltaRaw = readString(formData, 'progressDelta');
  const progressDelta =
    progressDeltaRaw === '' ? 0 : Number(progressDeltaRaw);
  if (!Number.isFinite(progressDelta)) {
    return { success: false, error: 'Progress added must be a number.' };
  }
  if (progressDelta < -100 || progressDelta > 100) {
    return {
      success: false,
      error: 'Progress added must be between -100 and 100.',
    };
  }

  const logDate = readString(formData, 'logDate') || todayIso();
  const { data: logRow, error } = await supabase
    .from('daily_task_logs')
    .insert({
      task_id: taskResult.task.id,
      user_id: actor.profile.id,
      log_date: logDate,
      hours_worked: hoursWorked,
      progress_delta: progressDelta,
      update_notes: readOptionalString(formData, 'notes'),
      raw_links: null,
      log_source: 'Manual',
      source_timer_id: null,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: describeDatabaseError(error) };

  const recalculated = await recalculateTaskMetrics(
    supabase,
    taskResult.task.id,
    progressDelta,
  );
  if (!recalculated.ok) {
    return {
      success: false,
      error: `Time saved, but task metrics could not be updated: ${recalculated.error}`,
    };
  }

  revalidateTimerViews(taskResult.task.taskTag);
  return { success: true, data: { logId: logRow.id } };
}

function mapTimerForPermission(
  row: {
    readonly id: string;
    readonly task_id: string;
    readonly user_id: string;
    readonly status: TaskTimer['status'];
    readonly started_at: string;
    readonly stopped_at: string | null;
    readonly elapsed_seconds: number;
    readonly generated_log_id: string | null;
    readonly notes: string | null;
    readonly created_at: string;
    readonly updated_at: string;
  },
): TaskTimer {
  return {
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    status: row.status,
    startedAt: row.started_at,
    stoppedAt: row.stopped_at,
    elapsedSeconds: row.elapsed_seconds,
    generatedLogId: row.generated_log_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function discardTimerAsManager(
  formData: FormData,
): Promise<TimerActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  if (!canManageTasks(actor.profile.role)) {
    return { success: false, error: 'Only managers can manage team timers.' };
  }

  return discardTaskTimer(formData);
}
