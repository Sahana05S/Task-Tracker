'use server';

import { normalizeTaskTagParam } from '@/modules/tasks';
import { createTaskLog } from '@/modules/time-tracking/actions';
import { revalidateAfterTimer } from '@/modules/time-tracking/internal/cache';
import { finishTimer, startItemTimerFor, startTimer, taskIdForTag } from '@/modules/time-tracking/internal/timers/commands';
import { commandIdentity, type ExecutionResult } from '@/shared/commands/result';
import { getCurrentProfile } from '@/shared/session/profile';
import type { ActionResponse } from '@/types/tracker';

/**
 * PUBLIC Server Actions for task timers and manual time entry. Stopping a
 * timer writes an ordinary task log; item timers are tagged with a checklist
 * row and count as task hours.
 */

export type TimerActionState = ActionResponse<ExecutionResult>;

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

const SIGN_IN_REQUIRED: TimerActionState = { success: false, error: 'Active sign-in required.', errorCode: 'forbidden' };

/** Refreshes the affected pages after a successful timer command. */
function committed(result: TimerActionState): TimerActionState {
  if (result.success) revalidateAfterTimer(result.data!.taskTag);
  return result;
}

/** Older forms send the timer as "id:version"; split it into its fields. */
function splitTimerVersion(form: FormData): void {
  if (!text(form, 'timerId').includes(':')) return;
  const [id, version] = text(form, 'timerId').split(':');
  form.set('timerId', id);
  form.set('expectedVersion', version);
}

async function timerCommand(form: FormData, command: 'start' | 'stop' | 'discard'): Promise<TimerActionState> {
  const actor = await getCurrentProfile();
  if (!actor?.isActive) return SIGN_IN_REQUIRED;
  if (command !== 'start') splitTimerVersion(form);

  const identity = commandIdentity(form);
  if (!identity.operationId || (command !== 'start' && identity.version === null)) {
    return { success: false, error: 'Missing operation key/version. Reload the form.', errorCode: 'validation' };
  }

  const payload = { notes: text(form, 'notes') || null, reason: text(form, 'reason') || null };
  if (command === 'start') {
    const task = await taskIdForTag(normalizeTaskTagParam(text(form, 'taskTag')));
    if (!task.ok) return task.result;
    return committed(await startTimer(task.id, payload, identity.operationId));
  }
  return committed(await finishTimer(command, text(form, 'timerId'), payload, identity.operationId, identity.version!));
}

export async function startTaskTimer(form: FormData) {
  return timerCommand(form, 'start');
}

/** Ordinary task timer tagged with a checklist item (migration 34); its stop logs count as task hours. */
export async function startItemTimer(form: FormData): Promise<TimerActionState> {
  const actor = await getCurrentProfile();
  if (!actor?.isActive) return SIGN_IN_REQUIRED;
  const identity = commandIdentity(form);
  if (!identity.operationId) return { success: false, error: 'Missing operation key. Reload the form.', errorCode: 'validation' };
  return committed(await startItemTimerFor(text(form, 'nodeId'), text(form, 'notes') || null, identity.operationId));
}

export async function stopTaskTimer(form: FormData) {
  return timerCommand(form, 'stop');
}

export async function discardTaskTimer(form: FormData) {
  return timerCommand(form, 'discard');
}

export async function discardTimerAsManager(form: FormData) {
  return timerCommand(form, 'discard');
}

/** Saves hours typed in by hand as an ordinary task log. */
export async function enterManualTaskTime(form: FormData): Promise<TimerActionState> {
  const task = await taskIdForTag(normalizeTaskTagParam(text(form, 'taskTag')));
  if (!task.ok) return task.result;
  form.set('taskId', task.id);
  form.set('updateNotes', text(form, 'notes'));
  return createTaskLog(null, form);
}
