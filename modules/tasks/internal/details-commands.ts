import { createClient } from '@/shared/supabase/server';
import type { Json } from '@/types/database';
import type { ActionResponse } from '@/types/tracker';

/** Writes for native task details, assets, relations and templates. PRIVATE. */

export interface DetailsCommand {
  taskId: string;
  command: string;
  payload: Json;
  expectedVersion: number;
  operationId: string;
}

/** Runs one native-details command through `task_details_command`. */
export async function runDetailsCommand(input: DetailsCommand): Promise<ActionResponse<Json>> {
  const db = await createClient();
  const { data, error } = await db.rpc('task_details_command', {
    p_task: input.taskId,
    p_command: input.command,
    p_payload: input.payload,
    p_expected_version: input.expectedVersion,
    p_operation: input.operationId,
  });
  if (error) {
    return { success: false, error: error.code === '40001' ? 'Task changed. Reload and review the current details.' : error.message };
  }
  return { success: true, data };
}

export interface PublishTemplate {
  templateId: string | null;
  name: string;
  expectedVersion: number;
  operationId: string;
  payload: Json;
}

/** Publishes a new version of a native detail template. */
export async function publishTemplate(input: PublishTemplate): Promise<ActionResponse<Json>> {
  const db = await createClient();
  const { data, error } = await db.rpc('publish_task_detail_template', {
    p_template: input.templateId,
    p_name: input.name,
    p_expected_version: input.expectedVersion,
    p_operation: input.operationId,
    p_payload: input.payload,
  });
  if (error) return { success: false, error: error.message };
  return { success: true, data };
}
