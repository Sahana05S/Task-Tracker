import type { ChecklistCommandInput } from '@/modules/checklists/internal/input';
import { createClient } from '@/shared/supabase/server';
import type { Json } from '@/types/database';
import type { ActionResponse } from '@/types/tracker';

/** Runs one checklist command through `checklist_command`. PRIVATE. */
export async function runChecklistCommand(input: ChecklistCommandInput): Promise<ActionResponse<Json>> {
  const db = await createClient();
  const { data, error } = await db.rpc('checklist_command', {
    p_task: input.taskId,
    p_command: input.command,
    p_payload: input.payload,
    p_expected_version: input.expectedVersion,
    p_operation: input.operationId,
  });
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}
