'use server';

import { getChecklistBranch } from '@/modules/checklists/internal/branch';
import type { ChecklistBranchRow } from '@/modules/checklists/internal/branch-types';
import { revalidateAfterChecklistChange } from '@/modules/checklists/internal/cache';
import type { ChecklistSection } from '@/modules/checklists/internal/progress';
import { runChecklistCommand } from '@/modules/checklists/internal/commands';
import { parseChecklistCommand } from '@/modules/checklists/internal/input';
import { NO_REVIEWS, type ObjectiveReviews } from '@/modules/checklists/internal/review';
import { getObjectiveReviews } from '@/modules/checklists/internal/review-read';
import { runQuestRequestCommand, type QuestRequestOp } from '@/modules/checklists/internal/quest-requests';
import { revalidatePath } from 'next/cache';
import { getCurrentProfile } from '@/shared/session/profile';
import type { Json } from '@/types/database';
import type { ActionResponse } from '@/types/tracker';

/**
 * PUBLIC Server Action for every checklist change (create, add, edit, state,
 * map, delete, duplicate, section, mode). The `checklist_command` RPC checks
 * permissions and versions; this resolves the caller and parses the form.
 */
export async function checklistCommand(form: FormData): Promise<ActionResponse<Json>> {
  const profile = await getCurrentProfile();
  if (!profile?.isActive) return { success: false, error: 'Active authentication required.' };

  const input = parseChecklistCommand(form);
  if (!input.ok) return { success: false, error: input.error };

  const result = await runChecklistCommand(input.value);
  if (result.success) revalidateAfterChecklistChange();
  return result;
}

/** Rows under one row, or a checklist's top-level rows in one phase, for the outline view (bounded). */
export async function loadChecklistRows(
  taskId: string,
  where: { checklistId: string; parentNodeId?: string | null; section: ChecklistSection },
): Promise<ActionResponse<{ rows: ChecklistBranchRow[]; hasMore: boolean }>> {
  const profile = await getCurrentProfile();
  if (!profile?.isActive) return { success: false, error: 'Active authentication required.' };
  try {
    const branch = await getChecklistBranch(taskId, { checklistId: where.checklistId, parentNodeId: where.parentNodeId ?? undefined, section: where.section, limit: 100 });
    return { success: true, data: { rows: branch.rows, hasMore: branch.hasMore } };
  } catch {
    return { success: false, error: 'These rows could not be loaded.' };
  }
}

/** A mission's objective reviews (114), for views loaded in the browser (Today's item work). */
export async function loadObjectiveReviews(taskId: string): Promise<ActionResponse<ObjectiveReviews>> {
  const profile = await getCurrentProfile();
  if (!profile?.isActive) return { success: false, error: 'Active authentication required.' };
  try {
    return { success: true, data: await getObjectiveReviews(taskId) };
  } catch {
    return { success: true, data: NO_REVIEWS };
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Asking someone outside the Crew to own a Quest (migration 131): request, cancel, accept or
 * decline. `quest_owner_request_command` checks who may, the limits and the mission; accepting adds
 * the person to the Crew.
 */
export async function questOwnerRequest(form: FormData): Promise<ActionResponse<unknown>> {
  const profile = await getCurrentProfile();
  if (!profile?.isActive) return { success: false, error: 'Active authentication required.' };
  const read = (key: string) => String(form.get(key) ?? '').trim();
  const op = read('op') as QuestRequestOp;
  if (!['request', 'cancel', 'accept', 'decline'].includes(op)) return { success: false, error: 'Unknown request action.' };
  const id = (key: string) => (UUID.test(read(key)) ? read(key) : null);
  const operationId = id('operationId');
  if (!operationId) return { success: false, error: 'Reload the page and try again.' };
  if (op === 'request' && !id('invitee_id')) return { success: false, error: 'Choose a member to ask.' };
  const result = await runQuestRequestCommand({ op, nodeId: id('node_id'), inviteeId: id('invitee_id'), requestId: id('request_id'), operationId });
  if (result.success) {
    revalidateAfterChecklistChange();
    revalidatePath('/today');
  }
  return result;
}
