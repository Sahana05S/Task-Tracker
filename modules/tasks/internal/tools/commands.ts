import { createClient } from '@/shared/supabase/server';
import { parsePreview, type ToolsPreview } from '@/modules/tasks/internal/tools/contract';
import type { Json } from '@/types/database';
import { isConflictCode } from '@/shared/commands/conflict';

/** Task Tools preview/commit RPCs. PRIVATE. */

export type Reply<T> = { success: true; data: T } | { success: false; error: string };

export interface CommittedItems {
  items: { taskId: string; taskTag: string; status: string }[];
}

type RpcError = { message: string; code?: string } | null;

/** A preview RPC's reply (Task Tools and month setup share the shape). */
export function previewReply(data: unknown, error: RpcError): Reply<ToolsPreview> {
  if (error) return { success: false, error: error.message };
  try {
    return { success: true, data: parsePreview(data) };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Preview unavailable.' };
  }
}

/** A commit RPC's reply: conflicts say so; a missing result asks for a retry with the same operation. */
export function commitReply(data: unknown, error: RpcError): Reply<CommittedItems> {
  if (error) return { success: false, error: isConflictCode(error.code) ? `Preview conflict: ${error.message}` : error.message };
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Array.isArray((data as { items?: unknown }).items)) {
    return { success: false, error: 'Command result unavailable. Retry with the same operation.' };
  }
  return { success: true, data: data as CommittedItems };
}

/** Asks the database for a durable preview of a batch operation. */
export async function requestPreview(command: string, payload: Record<string, Json | undefined>): Promise<Reply<ToolsPreview>> {
  const client = await createClient();
  const { data, error } = await client.rpc('task_tools_preview', { p_command: command, p_payload: payload });
  return previewReply(data, error);
}

/** Commits a reviewed preview atomically. */
export async function commitPreview(previewId: string, operationId: string): Promise<Reply<CommittedItems>> {
  const client = await createClient();
  const { data, error } = await client.rpc('task_tools_command', { p_preview: previewId, p_operation: operationId });
  return commitReply(data, error);
}
