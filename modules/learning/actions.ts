'use server';

import { revalidatePath } from 'next/cache';

import { runNoteCommand } from '@/modules/learning/internal/commands';
import { NOTE_MAX_HASHTAGS, NOTE_MAX_LENGTH } from '@/modules/learning/internal/rules';
import { readString, UUID_PATTERN } from '@/shared/forms/form-data';
import { resolveActor } from '@/shared/session/actor';
import type { ActionResponse } from '@/types/tracker';

/**
 * PUBLIC Server Actions for Notes (migration 126). The database decides who
 * may write and that every note carries a type hashtag (mission_note_command);
 * these only check the shape of the input.
 */

const RETRY = 'Reload the page and try again.';

function revalidateMission(taskTag: string) {
  if (taskTag) revalidatePath(`/tasks/${encodeURIComponent(taskTag)}`);
}

/** `labelIds` and `newLabels` arrive as repeated form fields. */
function readAll(form: FormData, key: string): string[] {
  return form.getAll(key).filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean);
}

/** Add a note (no noteId; optionally on a Quest or objective, nodeId) or edit one. */
export async function saveNote(form: FormData): Promise<ActionResponse<null>> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error, errorCode: 'forbidden' };
  const taskId = readString(form, 'taskId'), taskTag = readString(form, 'taskTag'), noteId = readString(form, 'noteId');
  const nodeId = readString(form, 'nodeId'), operationId = readString(form, 'operationId'), body = readString(form, 'body').trim();
  const labelIds = [...new Set(readAll(form, 'labelIds'))], newLabels = [...new Set(readAll(form, 'newLabels'))];
  if (!UUID_PATTERN.test(taskId) || !UUID_PATTERN.test(operationId) || (noteId && !UUID_PATTERN.test(noteId))
    || (nodeId && !UUID_PATTERN.test(nodeId)) || !labelIds.every((id) => UUID_PATTERN.test(id))) {
    return { success: false, error: RETRY, errorCode: 'validation' };
  }
  if (!body) return { success: false, error: 'Write the note first.', errorCode: 'validation' };
  if (body.length > NOTE_MAX_LENGTH) return { success: false, error: `Keep it under ${NOTE_MAX_LENGTH} characters.`, errorCode: 'validation' };
  if (!labelIds.length && !newLabels.length) return { success: false, error: 'Add at least one type hashtag, such as #mistake or #learning.', errorCode: 'validation' };
  if (labelIds.length + newLabels.length > NOTE_MAX_HASHTAGS) return { success: false, error: `A note carries up to ${NOTE_MAX_HASHTAGS} hashtags.`, errorCode: 'validation' };
  const result = await runNoteCommand({
    op: noteId ? 'edit' : 'add', taskId, noteId: noteId || null, nodeId: noteId ? null : nodeId || null, body, labelIds, newLabels, operationId,
  });
  if (!result.ok) return { success: false, error: result.error, errorCode: result.code };
  revalidateMission(taskTag);
  return { success: true, data: null };
}

export async function deleteNote(form: FormData): Promise<ActionResponse<null>> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error, errorCode: 'forbidden' };
  const taskId = readString(form, 'taskId'), taskTag = readString(form, 'taskTag');
  const noteId = readString(form, 'noteId'), operationId = readString(form, 'operationId');
  if (![taskId, noteId, operationId].every((id) => UUID_PATTERN.test(id))) return { success: false, error: RETRY, errorCode: 'validation' };
  const result = await runNoteCommand({ op: 'delete', taskId, noteId, nodeId: null, body: null, labelIds: [], newLabels: [], operationId });
  if (!result.ok) return { success: false, error: result.error, errorCode: result.code };
  revalidateMission(taskTag);
  return { success: true, data: null };
}
