'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentProfile } from '@/lib/auth/profile';
import { getLoggableTasksFor } from '@/lib/logs/queries';
import { createClient } from '@/lib/supabase/server';
import { commandIdentity, executionError, executionResult, type ExecutionResult } from '@/lib/commands/result';
import type { ActionResponse } from '@/types/tracker';
export type LogActionState = ActionResponse<ExecutionResult>;
const MAX_HOURS_PER_ENTRY=24;
const MAX_RAW_LINKS=10;
const FUTURE_DATE_GRACE_DAYS=1;
async function resolveActor() {
 const profile=await getCurrentProfile();
 return profile?.isActive ? { ok: true as const, profile } : { ok: false as const, error: 'Active sign-in required.' };
}
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

  const logDate = readString(formData, 'logDate');
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


function revalidateAffected(taskTag: string) {
 for (const path of ['/logs','/tasks','/dashboard','/team','/reports',`/tasks/${encodeURIComponent(taskTag)}`]) revalidatePath(path);
 revalidatePath('/team/[employeeId]','page');
}
async function saveLog(formData: FormData, correcting: boolean): Promise<LogActionState> {
 const actor=await resolveActor(); if (!actor.ok) return { success:false,error:actor.error,errorCode:'forbidden' };
 const parsed=parseLogInput(formData); if (!parsed.ok) return { success:false,error:parsed.error,errorCode:'validation' };
 const identity=commandIdentity(formData);
 if (!identity.operationId || (correcting && identity.version===null)) return { success:false,error:'Missing operation key/version. Reload the form.',errorCode:'validation' };
 const { input }=parsed;
 const payload={ log_date:input.logDate,hours_worked:input.hoursWorked,requested_delta:input.progressDelta,
  notes:input.updateNotes,raw_links:input.rawLinks,reason:readNullableString(formData,'reason') };
 const supabase=await createClient();
 if (correcting) {
  const logId=readId(formData,'logId'); if (!logId) return {success:false,error:'Missing log reference.'};
  const {data: log,error}=await supabase.from('daily_task_logs').select('task_id').eq('id',logId).maybeSingle();
  if (error) return executionError(error);
  if (!log || log.task_id!==input.taskId) return {success:false,error:'A correction keeps its original task. Reverse it and create a separate entry once the record policy permits.',errorCode:'validation'};
  const result=await supabase.rpc('correct_task_log',{p_log_id:logId,p_payload:payload,p_operation_id:identity.operationId,p_expected_version:identity.version!});
  if (result.error) return executionError(result.error);
  const data=executionResult(result.data); revalidateAffected(data.taskTag); return {success:true,data};
 }
 const result=await supabase.rpc('create_task_log',{p_task_id:input.taskId,p_payload:payload,p_operation_id:identity.operationId});
 if (result.error) return executionError(result.error);
 const data=executionResult(result.data); revalidateAffected(data.taskTag); return {success:true,data};
}
export async function createTaskLog(_previous: LogActionState|null,form: FormData) { return saveLog(form,false); }
export async function updateTaskLog(_previous: LogActionState|null,form: FormData) { return saveLog(form,true); }
export async function deleteTaskLog(logId: string,operationId: string,expectedVersion: number,reason: string): Promise<LogActionState> {
 const supabase=await createClient();
 const result=await supabase.rpc('reverse_task_log',{p_log_id:logId,p_payload:{reason},p_operation_id:operationId,p_expected_version:expectedVersion});
 if (result.error) return executionError(result.error);
 const data=executionResult(result.data); revalidateAffected(data.taskTag); return {success:true,data};
}
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
