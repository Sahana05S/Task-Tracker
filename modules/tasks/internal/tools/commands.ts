import { createClient } from '@/shared/supabase/server';
import { parsePreview, type ToolsPreview } from '@/modules/tasks/internal/tools/contract';
import type { Json } from '@/types/database';

/** Task Tools preview/commit RPCs. PRIVATE. */

export type Reply<T> = { success: true; data: T } | { success: false; error: string };

export interface CommittedItems {
  items: { taskId: string; taskTag: string; status: string }[];
}

/** Asks the database for a durable preview of a batch operation. */
export async function requestPreview(command: string, payload: Record<string, Json | undefined>): Promise<Reply<ToolsPreview>> {
  const client = await createClient();
  const { data, error } = await client.rpc('task_tools_preview', { p_command: command, p_payload: payload });
  if (error) return { success: false, error: error.message };
  try {
    return { success: true, data: parsePreview(data) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Preview unavailable.' };
  }
}

/** Commits a reviewed preview atomically. */
export async function commitPreview(previewId: string, operationId: string): Promise<Reply<CommittedItems>> {
  const client = await createClient();
  const { data, error } = await client.rpc('task_tools_command', { p_preview: previewId, p_operation: operationId });
  if (error) return { success: false, error: error.code === '40001' ? `Preview conflict: ${error.message}` : error.message };
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray(data.items)) {
    return { success: false, error: 'Command result unavailable. Retry with the same operation.' };
  }
  return { success: true, data: data as unknown as CommittedItems };
}
