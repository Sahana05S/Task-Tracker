'use server';

import { revalidateAfterLog } from '@/modules/time-tracking/internal/cache';
import { correctLog, createLog, reverseLog } from '@/modules/time-tracking/internal/logs/commands';
import { logPayload, parseLogInput, readId } from '@/modules/time-tracking/internal/logs/input';
import { getLoggableTasksFor } from '@/modules/time-tracking/internal/logs/queries';
import { commandIdentity, type ExecutionResult } from '@/shared/commands/result';
import { readNullableString } from '@/shared/forms/form-data';
import { getCurrentProfile } from '@/shared/session/profile';
import type { ActionResponse } from '@/types/tracker';

/**
 * PUBLIC Server Actions for work logs: create, correct, reverse, and the task
 * picker for the quick-log drawer. The RPCs enforce permissions and versions.
 */

export type LogActionState = ActionResponse<ExecutionResult>;

const SIGN_IN_REQUIRED = 'Active sign-in required.';

async function activeProfile() {
  const profile = await getCurrentProfile();
  return profile?.isActive ? profile : null;
}

/** Creates a log, or corrects one when `correcting`. */
async function saveLog(formData: FormData, correcting: boolean): Promise<LogActionState> {
  if (!(await activeProfile())) return { success: false, error: SIGN_IN_REQUIRED, errorCode: 'forbidden' };

  const parsed = parseLogInput(formData);
  if (!parsed.ok) return { success: false, error: parsed.error, errorCode: 'validation' };

  const identity = commandIdentity(formData);
  if (!identity.operationId || (correcting && identity.version === null)) {
    return { success: false, error: 'Missing operation key/version. Reload the form.', errorCode: 'validation' };
  }

  const { input } = parsed;
  const payload = logPayload(input, readNullableString(formData, 'reason'));

  let result: LogActionState;
  if (correcting) {
    const logId = readId(formData, 'logId');
    if (!logId) return { success: false, error: 'Missing log reference.' };
    result = await correctLog(logId, input.taskId, payload, identity.operationId, identity.version!);
  } else {
    result = await createLog(input.taskId, payload, identity.operationId);
  }

  if (result.success) revalidateAfterLog(result.data!.taskTag);
  return result;
}

export async function createTaskLog(_previous: LogActionState | null, form: FormData) {
  return saveLog(form, false);
}

export async function updateTaskLog(_previous: LogActionState | null, form: FormData) {
  return saveLog(form, true);
}

export async function deleteTaskLog(
  logId: string,
  operationId: string,
  expectedVersion: number,
  reason: string,
): Promise<LogActionState> {
  const result = await reverseLog(logId, reason, operationId, expectedVersion);
  if (result.success) revalidateAfterLog(result.data!.taskTag);
  return result;
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
export async function loadLoggableTasks(): Promise<ActionResponse<LoggableTaskOption[]>> {
  const profile = await activeProfile();
  if (!profile) return { success: false, error: SIGN_IN_REQUIRED };

  try {
    const tasks = await getLoggableTasksFor(profile.id);
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
    return { success: false, error: error instanceof Error ? error.message : 'Could not load tasks.' };
  }
}
