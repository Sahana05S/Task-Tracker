import type { DatedRecordCommand } from '@/modules/records/internal/input';
import { createClient } from '@/shared/supabase/server';
import type { ActionResponse } from '@/types/tracker';
import { isConflictCode } from '@/shared/commands/conflict';

/** Runs `dated_record_command` and validates its `{ id, version }` result. PRIVATE. */
export async function runDatedRecordCommand(input: DatedRecordCommand): Promise<ActionResponse<{ id: string; version: number }>> {
  const db = await createClient();
  const { data, error } = await db.rpc('dated_record_command', {
    p_kind: input.kind,
    p_id: input.recordId,
    p_command: input.command,
    p_payload: input.payload,
    p_expected_version: input.expectedVersion,
    p_operation: input.operationId,
  });
  if (error) {
    return {
      success: false,
      error: error.message,
      errorCode: isConflictCode(error.code) ? 'conflict' : error.code === '42501' ? 'forbidden' : 'validation',
    };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.id !== 'string' || typeof data.version !== 'number') {
    return { success: false, error: 'Invalid saved-record response.', errorCode: 'unavailable' };
  }
  return { success: true, data: { id: data.id, version: data.version } };
}
