'use server';

import { getLabelCatalogue, type Label } from '@/modules/labels';
import { runNoteCommand } from '@/modules/learning/internal/commands';
import { getQuestNotes } from '@/modules/learning/internal/queries';
import type { QuestNotes } from '@/modules/learning/internal/rules';
import { revalidateAfterNotes } from '@/modules/learning/internal/cache';
import { getCurrentProfile } from '@/shared/session/profile';
import type { ActionResponse } from '@/types/tracker';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One Quest's notes and the company's labels, read when the panel opens (migration 132). */
export async function loadQuestNotes(nodeId: string): Promise<ActionResponse<{ notes: QuestNotes; labels: Label[]; canCreateLabels: boolean }>> {
  const profile = await getCurrentProfile();
  if (!profile?.isActive) return { success: false, error: 'Active authentication required.' };
  if (!UUID.test(nodeId)) return { success: false, error: 'Quest not found.' };
  const [notes, catalogue] = await Promise.all([getQuestNotes(nodeId), getLabelCatalogue()]);
  if (!notes) return { success: false, error: 'These notes could not be loaded.' };
  return { success: true, data: { notes, labels: (catalogue?.labels ?? []).filter((label) => !label.archived), canCreateLabels: catalogue?.canManage ?? false } };
}

/** Add, edit or delete a Quest note; mission_note_command decides who may. */
export async function questNoteCommand(form: FormData): Promise<ActionResponse<unknown>> {
  const profile = await getCurrentProfile();
  if (!profile?.isActive) return { success: false, error: 'Active authentication required.' };
  const read = (key: string) => String(form.get(key) ?? '').trim();
  const op = read('op');
  if (op !== 'add' && op !== 'edit' && op !== 'delete') return { success: false, error: 'Unknown note action.' };
  const id = (key: string) => (UUID.test(read(key)) ? read(key) : null);
  const taskId = id('taskId');
  const operationId = id('operationId');
  if (!taskId || !operationId) return { success: false, error: 'Reload the page and try again.' };
  const values = (key: string) => form.getAll(key).map((value) => String(value).trim()).filter(Boolean);
  const result = await runNoteCommand({
    op, taskId, noteId: id('note_id'), nodeId: id('node_id'), body: op === 'delete' ? null : read('body'),
    labelIds: values('label_id').filter((value) => UUID.test(value)), newLabels: values('new_label'), operationId,
  });
  if (result.success) revalidateAfterNotes();
  return result;
}
