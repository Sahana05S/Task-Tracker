'use server';

import { revalidatePath } from 'next/cache';

import { parseReviewInput } from '@/modules/hr/internal/review-input';
import { runReviewCommand } from '@/modules/hr/internal/reviews';
import { resolveActor } from '@/shared/session/actor';
import type { ActionResponse } from '@/types/tracker';

/**
 * PUBLIC Server Action for performance reviews: one entry point for every
 * operation (create, self, director, return, withdraw, metric). The role
 * check only gives a friendly message; `performance_review_command` enforces
 * who may do what and when.
 */
export async function reviewAction(form: FormData): Promise<ActionResponse<{ id: string | null; version: number | null; created: number | null }>> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error, errorCode: 'forbidden' };
  const input = parseReviewInput(form);
  if (!input.ok) return { success: false, error: input.error, errorCode: 'validation' };
  if (input.value.op !== 'self' && actor.profile.role !== 'managing_director') {
    return { success: false, error: 'Only the managing director can do this.', errorCode: 'forbidden' };
  }
  const result = await runReviewCommand(input.value);
  if (!result.ok) return { success: false, error: result.error };
  revalidatePath('/hr', 'layout');
  revalidatePath('/today');
  return { success: true, data: { id: result.id, version: result.version, created: result.created } };
}
