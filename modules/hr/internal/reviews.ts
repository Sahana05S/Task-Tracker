import 'server-only';

import { isConflictCode } from '@/shared/commands/conflict';
import { createClient } from '@/shared/supabase/server';
import { isMissingFunctionError } from '@/shared/supabase/schema-errors';
import type { Json } from '@/types/database';

import { mapReview, mapReviewList, type ReviewList, type ReviewSheet } from './review-model';

/**
 * Performance review reads and commands (migration 81). PRIVATE. The
 * functions are the permission boundary: the employee and the managing
 * director only; the director's side reaches the employee once completed.
 */

export type ReviewRead<T> = { ok: true; data: T } | { ok: false; reason: 'unavailable' | 'not_found'; error: string };

function failure(error: { code?: string; message: string }): ReviewRead<never> {
  if (isMissingFunctionError(error)) return { ok: false, reason: 'unavailable', error: 'Performance reviews need the latest database update (migration 81).' };
  if (error.code === 'P0002' || error.code === '42501') return { ok: false, reason: 'not_found', error: error.message };
  throw new Error(`Performance reviews could not be loaded: ${error.message}`);
}

export async function readReviewList(): Promise<ReviewRead<ReviewList>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('performance_reviews');
  return error ? failure(error) : { ok: true, data: mapReviewList(data) };
}

export async function readReview(reviewId: string): Promise<ReviewRead<ReviewSheet>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('performance_review', { p_review: reviewId });
  return error ? failure(error) : { ok: true, data: mapReview(data) };
}

/** Reviews waiting on the member's own rating; empty before migration 81. */
export async function readPendingSelfReviews(userId: string): Promise<{ id: string; title: string }[]> {
  const list = await readReviewList().catch(() => null);
  if (!list?.ok) return [];
  return list.data.reviews
    .filter(review => review.employeeId === userId && review.status === 'awaiting_self')
    .map(review => ({ id: review.id, title: review.title }));
}

export type ReviewOp = 'create' | 'self' | 'director' | 'return' | 'withdraw' | 'metric';
export type ReviewCommandResult = { ok: true; id: string | null; version: number | null; created: number | null } | { ok: false; error: string };

export async function runReviewCommand(input: {
  op: ReviewOp; reviewId: string | null; payload: { [key: string]: Json }; expectedVersion: number; operationId: string;
}): Promise<ReviewCommandResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('performance_review_command', {
    p_op: input.op, p_review: input.reviewId, p_payload: input.payload, p_expected_version: input.expectedVersion, p_operation: input.operationId,
  });
  if (error) {
    if (isConflictCode(error.code)) return { ok: false, error: 'This review was changed meanwhile. Reload the page and try again.' };
    if (isMissingFunctionError(error)) return { ok: false, error: 'Performance reviews need the latest database update (migration 81).' };
    if (['42501', '23514', '23505', 'P0002'].includes(error.code ?? '')) return { ok: false, error: error.message };
    return { ok: false, error: `The change was not saved: ${error.message}` };
  }
  const value = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  const num = (key: string) => (value[key] === undefined || value[key] === null ? null : Number(value[key]));
  return { ok: true, id: typeof value.id === 'string' ? value.id : null, version: num('version'), created: num('created') };
}
