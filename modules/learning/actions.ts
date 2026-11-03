'use server';

import { revalidatePath } from 'next/cache';

import { runLearningCommand } from '@/modules/learning/internal/commands';
import { isLearningKind, LEARNING_MAX_LENGTH } from '@/modules/learning/internal/rules';
import { readString, UUID_PATTERN } from '@/shared/forms/form-data';
import { resolveActor } from '@/shared/session/actor';
import type { ActionResponse } from '@/types/tracker';

/**
 * PUBLIC Server Actions for Mistakes and learning (migration 111). The
 * database decides who may write (mission_learning_command); these only
 * check the shape of the input.
 */

const RETRY = 'Reload the page and try again.';

function revalidateMission(taskTag: string) {
  if (taskTag) revalidatePath(`/tasks/${encodeURIComponent(taskTag)}`);
}

/** Add a note (no learningId) or edit one. */
export async function saveLearning(form: FormData): Promise<ActionResponse<null>> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error, errorCode: 'forbidden' };
  const taskId = readString(form, 'taskId'), taskTag = readString(form, 'taskTag'), learningId = readString(form, 'learningId');
  const operationId = readString(form, 'operationId'), kind = readString(form, 'kind'), body = readString(form, 'body').trim();
  if (!UUID_PATTERN.test(taskId) || !UUID_PATTERN.test(operationId) || (learningId && !UUID_PATTERN.test(learningId))) {
    return { success: false, error: RETRY, errorCode: 'validation' };
  }
  if (!isLearningKind(kind)) return { success: false, error: 'Choose mistake or learning.', errorCode: 'validation' };
  if (!body) return { success: false, error: 'Write what happened or what was learned.', errorCode: 'validation' };
  if (body.length > LEARNING_MAX_LENGTH) return { success: false, error: `Keep it under ${LEARNING_MAX_LENGTH} characters.`, errorCode: 'validation' };
  const result = await runLearningCommand({ op: learningId ? 'edit' : 'add', taskId, learningId: learningId || null, kind, body, operationId });
  if (!result.ok) return { success: false, error: result.error, errorCode: result.code };
  revalidateMission(taskTag);
  return { success: true, data: null };
}

export async function withdrawLearning(form: FormData): Promise<ActionResponse<null>> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error, errorCode: 'forbidden' };
  const taskId = readString(form, 'taskId'), taskTag = readString(form, 'taskTag');
  const learningId = readString(form, 'learningId'), operationId = readString(form, 'operationId');
  if (![taskId, learningId, operationId].every((id) => UUID_PATTERN.test(id))) return { success: false, error: RETRY, errorCode: 'validation' };
  const result = await runLearningCommand({ op: 'withdraw', taskId, learningId, kind: null, body: null, operationId });
  if (!result.ok) return { success: false, error: result.error, errorCode: result.code };
  revalidateMission(taskTag);
  return { success: true, data: null };
}
