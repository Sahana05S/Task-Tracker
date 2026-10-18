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
