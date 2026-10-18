'use server';

import { revalidateMilestones } from '@/modules/milestones/internal/cache';
import {
  deleteMilestoneRow,
  insertMilestone,
  updateMilestoneRow,
  updateStatementRow,
} from '@/modules/milestones/internal/commands';
import {
  isMilestoneId,
  parseMilestoneInput,
  parseStatementInput,
  readId,
} from '@/modules/milestones/internal/input';
import { canEditMilestones, NOT_ALLOWED } from '@/modules/milestones/internal/permissions';
import { resolveActor, type Actor } from '@/shared/session/actor';
import type { ActionResponse } from '@/types/tracker';

/**
 * PUBLIC Server Actions for the organisational statements and milestones.
 *
 * Each one: resolve the editor -> parse input -> run the command -> revalidate.
 * The role check runs before input parsing, as it always has, so a non-editor
 * sees the permission message whatever they submitted. RLS remains the real
 * boundary (see internal/permissions.ts).
 */

export type StatementActionState = ActionResponse<{
  statementId: string;
  title: string;
}>;

export type MilestoneActionState = ActionResponse<{ milestoneId: string }>;

/** Resolves the caller and confirms they may edit organisational content. */
async function resolveEditor(): Promise<Actor> {
  const actor = await resolveActor();
  if (actor.ok && !canEditMilestones(actor.profile.role)) {
    return { ok: false, error: NOT_ALLOWED };
  }
  return actor;
}

/** Rewrites one statement block: vision, mission or core values. */
export async function updateStatement(
  _prevState: StatementActionState | null,
  formData: FormData,
): Promise<StatementActionState> {
  const actor = await resolveEditor();
  if (!actor.ok) return { success: false, error: actor.error };

  const input = parseStatementInput(formData);
  if (!input.ok) return { success: false, error: input.error };

  const result = await updateStatementRow(input.value, actor.profile.id);
  if (!result.ok) return { success: false, error: result.error };

  revalidateMilestones();
  const { statementId, title } = input.value;
  return { success: true, data: { statementId, title } };
}

export async function createMilestone(
  _prevState: MilestoneActionState | null,
  formData: FormData,
): Promise<MilestoneActionState> {
  const actor = await resolveEditor();
  if (!actor.ok) return { success: false, error: actor.error };

  const input = parseMilestoneInput(formData);
  if (!input.ok) return { success: false, error: input.error };

  const result = await insertMilestone(input.value);
  if (!result.ok) return { success: false, error: result.error };

  revalidateMilestones();
  return { success: true, data: { milestoneId: result.value } };
}

export async function updateMilestone(
  _prevState: MilestoneActionState | null,
  formData: FormData,
): Promise<MilestoneActionState> {
  const actor = await resolveEditor();
  if (!actor.ok) return { success: false, error: actor.error };

  const milestoneId = readId(formData, 'milestoneId');
  if (milestoneId === null) {
    return { success: false, error: 'Missing milestone reference.' };
  }

  const input = parseMilestoneInput(formData);
  if (!input.ok) return { success: false, error: input.error };

  const result = await updateMilestoneRow(milestoneId, input.value);
  if (!result.ok) return { success: false, error: result.error };

  revalidateMilestones();
  return { success: true, data: { milestoneId } };
}

/**
 * Removes a milestone outright.
 *
 * Called directly rather than through `useActionState`, since there is no form to
 * carry — the confirmation happens in the UI. Deletion is permanent.
 */
export async function deleteMilestone(
  milestoneId: string,
): Promise<MilestoneActionState> {
  const actor = await resolveEditor();
  if (!actor.ok) return { success: false, error: actor.error };

  if (!isMilestoneId(milestoneId)) {
    return { success: false, error: 'Missing milestone reference.' };
  }

  const result = await deleteMilestoneRow(milestoneId);
  if (!result.ok) return { success: false, error: result.error };

  revalidateMilestones();
  return { success: true, data: { milestoneId } };
}
