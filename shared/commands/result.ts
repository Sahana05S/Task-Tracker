import type { Json } from '@/types/database';
import type { ActionResponse } from '@/types/tracker';
import { isConflictCode } from '@/shared/commands/conflict';

export interface ExecutionResult {
  logId?: string; timerId?: string; taskId: string; taskTag: string;
  version: number; metricVersion?: number; requestedDelta?: number; effectiveDelta?: number | null;
}
export function executionError(error: { code: string; message: string }): ActionResponse<ExecutionResult> {
  const errorCode = isConflictCode(error.code) || error.code === '23505' ? 'conflict'
    : error.code === '42501' ? 'forbidden' : error.code.startsWith('22') || error.code === '23514' || error.code === '23503' ? 'validation' : 'unavailable';
  return { success: false, errorCode, error: error.code === '23505'
    ? 'You already have a running timer. Stop or discard it first.' : error.message };
}
export function executionResult(value: Json): ExecutionResult {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      typeof value.taskId !== 'string' || typeof value.taskTag !== 'string' || typeof value.version !== 'number') {
    throw new Error('Unexpected command response. Retry with the same operation key to recover the committed result.');
  }
  return value as unknown as ExecutionResult;
}
export function commandIdentity(form: FormData) {
  const operationId = String(form.get('operationId') ?? '');
  const rawVersion = String(form.get('expectedVersion') ?? '');
  const version = rawVersion === '' ? null : Number(rawVersion);
  return { operationId: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId) ? operationId : null,
    version: version !== null && Number.isSafeInteger(version) && version >= 0 ? version : null };
}
