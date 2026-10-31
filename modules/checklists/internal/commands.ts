import type { ChecklistCommandInput } from '@/modules/checklists/internal/input';
import { isConflictCode } from '@/shared/commands/conflict';
import { createClient } from '@/shared/supabase/server';
import type { Json } from '@/types/database';
import type { ActionResponse } from '@/types/tracker';

/**
 * Runs one checklist command through `checklist_command`. PRIVATE. A version
 * conflict (PT409, or 40001 before migration 52) comes back as `errorCode:
 * 'conflict'`; any other failure keeps only its message.
 */
export async function runChecklistCommand(input: ChecklistCommandInput): Promise<ActionResponse<Json>> {
  const db = await createClient();
  const { data, error } = await db.rpc('checklist_command', {
    p_task: input.taskId,
    p_command: input.command,
    p_payload: input.payload,
    p_expected_version: input.expectedVersion,
    p_operation: input.operationId,
  });
  if (error) {
    return isConflictCode(error.code)
      ? { success: false, error: error.message, errorCode: 'conflict' }
      : { success: false, error: error.message };
  }
  return { success: true, data };
}
