import type { logPayload } from '@/modules/time-tracking/internal/logs/input';
import { executionError, executionResult, type ExecutionResult } from '@/shared/commands/result';
import { createClient } from '@/shared/supabase/server';
import type { ActionResponse } from '@/types/tracker';

/** Work-log writes: create, correct and reverse, each one atomic RPC. PRIVATE. */

type LogResult = ActionResponse<ExecutionResult>;
type LogPayload = ReturnType<typeof logPayload>;

const ok = (data: ExecutionResult): LogResult => ({ success: true, data });

export async function createLog(taskId: string, payload: LogPayload, operationId: string): Promise<LogResult> {
  const supabase = await createClient();
  const result = await supabase.rpc('create_task_log', { p_task_id: taskId, p_payload: payload, p_operation_id: operationId });
  if (result.error) return executionError(result.error);
  return ok(executionResult(result.data));
}

/** Corrects a log in place. A correction must keep the log's original task. */
export async function correctLog(
  logId: string,
  taskId: string,
  payload: LogPayload,
  operationId: string,
  expectedVersion: number,
): Promise<LogResult> {
  const supabase = await createClient();
  const { data: log, error } = await supabase.from('daily_task_logs').select('task_id').eq('id', logId).maybeSingle();
  if (error) return executionError(error);
  if (!log || log.task_id !== taskId) {
    return {
      success: false,
      error: 'A correction keeps its original task. Reverse it and create a separate entry once the record policy permits.',
      errorCode: 'validation',
    };
  }
  const result = await supabase.rpc('correct_task_log', {
    p_log_id: logId,
    p_payload: payload,
    p_operation_id: operationId,
    p_expected_version: expectedVersion,
  });
  if (result.error) return executionError(result.error);
  return ok(executionResult(result.data));
}

/** Reverses (withdraws) a log; the record is retained. */
export async function reverseLog(logId: string, reason: string, operationId: string, expectedVersion: number): Promise<LogResult> {
  const supabase = await createClient();
  const result = await supabase.rpc('reverse_task_log', {
    p_log_id: logId,
    p_payload: { reason },
    p_operation_id: operationId,
    p_expected_version: expectedVersion,
  });
  if (result.error) return executionError(result.error);
  return ok(executionResult(result.data));
}
