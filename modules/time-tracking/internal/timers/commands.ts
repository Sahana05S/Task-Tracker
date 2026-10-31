import { executionError, executionResult, type ExecutionResult } from '@/shared/commands/result';
import { createClient } from '@/shared/supabase/server';
import type { Json } from '@/types/database';
import type { ActionResponse } from '@/types/tracker';

/** Timer RPCs: start, start on a checklist item, stop and discard. PRIVATE. */

type TimerResult = ActionResponse<ExecutionResult>;

const ok = (data: ExecutionResult): TimerResult => ({ success: true, data });
const TASK_GONE: TimerResult = { success: false, error: 'Task no longer exists.', errorCode: 'validation' };

/** Looks up a task id by tag. Returns the id, or an error result. */
export async function taskIdForTag(taskTag: string | null): Promise<{ ok: true; id: string } | { ok: false; result: TimerResult }> {
  const supabase = await createClient();
  const task = await supabase.from('tasks').select('id').eq('task_tag', taskTag ?? '').maybeSingle();
  if (task.error) return { ok: false, result: executionError(task.error) };
  if (!task.data) return { ok: false, result: TASK_GONE };
  return { ok: true, id: task.data.id };
}

export async function startTimer(taskId: string, payload: Json, operationId: string): Promise<TimerResult> {
  const supabase = await createClient();
  const result = await supabase.rpc('start_task_timer', { p_task_id: taskId, p_payload: payload, p_operation_id: operationId });
  if (result.error) return executionError(result.error);
  return ok(executionResult(result.data));
}

/** An ordinary task timer tagged with a checklist item (migration 34). */
export async function startItemTimerFor(nodeId: string, notes: string | null, operationId: string): Promise<TimerResult> {
  const supabase = await createClient();
  const result = await supabase.rpc('start_checklist_item_timer', {
    p_node_id: nodeId,
    p_payload: { notes },
    p_operation_id: operationId,
  });
  if (result.error) return executionError(result.error);
  return ok(executionResult(result.data));
}

export async function finishTimer(
  command: 'stop' | 'discard',
  timerId: string,
  payload: Json,
  operationId: string,
  expectedVersion: number,
): Promise<TimerResult> {
  const supabase = await createClient();
  const args = { p_timer_id: timerId, p_payload: payload, p_operation_id: operationId, p_expected_version: expectedVersion };
  const result = command === 'stop' ? await supabase.rpc('stop_task_timer', args) : await supabase.rpc('discard_task_timer', args);
  if (result.error) return executionError(result.error);
  return ok(executionResult(result.data));
}

/** A timer run entirely offline, sent later under an offline grant (migration 98). */
export async function recordOfflineTimerFor(input: {
  taskId: string; nodeId: string | null; startedAt: string; endedAt: string; grantId: string; operationId: string; notes: string | null;
}): Promise<TimerResult> {
  const supabase = await createClient();
  const result = await supabase.rpc('record_offline_timer', {
    p_task: input.taskId,
    p_node: input.nodeId,
    p_started_at: input.startedAt,
    p_ended_at: input.endedAt,
    p_grant: input.grantId,
    p_operation: input.operationId,
    p_notes: input.notes,
  });
  if (result.error) return executionError(result.error);
  return ok(executionResult(result.data));
}

/** Stops a server timer at the time the phone stopped it offline (migration 98). */
export async function stopTimerAtFor(input: {
  timerId: string; expectedVersion: number; endedAt: string; grantId: string; operationId: string; notes: string | null;
}): Promise<TimerResult> {
  const supabase = await createClient();
  const result = await supabase.rpc('stop_task_timer_at', {
    p_timer_id: input.timerId,
    p_payload: { notes: input.notes },
    p_operation_id: input.operationId,
    p_expected_version: input.expectedVersion,
    p_ended_at: input.endedAt,
    p_grant: input.grantId,
  });
  if (result.error) return executionError(result.error);
  return ok(executionResult(result.data));
}
