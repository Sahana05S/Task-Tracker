import 'server-only';

import { createClient } from '@/shared/supabase/server';
import type { ActionResponse } from '@/types/tracker';
import { mapMyQuestRequests, mapQuestRequestsFor, type MyQuestRequest, type QuestRequests } from './quest-request-rules';

/**
 * Quest owner requests (migration 131). PRIVATE. Reads return null when the
 * database predates 131 or the read fails, so pages render without them.
 */

/** The caller's waiting requests (Today). */
export async function getMyQuestRequests(): Promise<MyQuestRequest[] | null> {
  const db = await createClient();
  const { data, error } = await db.rpc('quest_owner_requests_mine');
  return error ? null : mapMyQuestRequests(data);
}

/** A mission's waiting requests and who may be asked (the checklist's Assign section). */
export async function getQuestRequestsFor(taskId: string): Promise<QuestRequests | null> {
  const db = await createClient();
  const { data, error } = await db.rpc('quest_owner_requests_for', { p_task: taskId });
  return error ? null : mapQuestRequestsFor(data);
}

export type QuestRequestOp = 'request' | 'cancel' | 'accept' | 'decline';

export async function runQuestRequestCommand(input: {
  op: QuestRequestOp; nodeId: string | null; inviteeId: string | null; requestId: string | null; operationId: string;
}): Promise<ActionResponse<unknown>> {
  const db = await createClient();
  const { data, error } = await db.rpc('quest_owner_request_command', {
    p_op: input.op, p_node: input.nodeId, p_invitee: input.inviteeId, p_request: input.requestId, p_operation: input.operationId,
  });
  return error ? { success: false, error: error.message } : { success: true, data };
}
