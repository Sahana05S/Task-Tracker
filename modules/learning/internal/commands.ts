import 'server-only';

import { isConflictCode } from '@/shared/commands/conflict';
import { createClient } from '@/shared/supabase/server';
import { isMissingFunctionError } from '@/shared/supabase/schema-errors';

/** Note writes through mission_note_command (migration 126). PRIVATE. */

export type NoteFailure = { ok: false; error: string; code: 'forbidden' | 'validation' | 'conflict' | 'unavailable' };

export interface NoteCommand {
  readonly op: 'add' | 'edit' | 'delete';
  readonly taskId: string;
  readonly noteId: string | null;
  /** The Quest or objective a new note is written on. */
  readonly nodeId: string | null;
  readonly body: string | null;
  /** Hashtags chosen from the list. */
  readonly labelIds: readonly string[];
  /** Hashtags typed by name (a manager may create one). */
  readonly newLabels: readonly string[];
  readonly operationId: string;
}

function failure(error: { code?: string; message: string }): NoteFailure {
  if (isMissingFunctionError(error)) return { ok: false, error: 'Notes need the latest database update (migration 126).', code: 'unavailable' };
  if (isConflictCode(error.code)) return { ok: false, error: 'This change was sent twice with different details. Try again.', code: 'conflict' };
  if (error.code === '42501') return { ok: false, error: error.message, code: 'forbidden' };
  if (['23514', 'P0002', '23505'].includes(error.code ?? '')) return { ok: false, error: error.message, code: 'validation' };
  return { ok: false, error: `The note was not saved: ${error.message}`, code: 'unavailable' };
}

export async function runNoteCommand(input: NoteCommand): Promise<{ ok: true } | NoteFailure> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('mission_note_command', {
    p_op: input.op, p_task: input.taskId, p_note: input.noteId, p_node: input.nodeId, p_body: input.body,
    p_labels: [...input.labelIds], p_new_labels: [...input.newLabels], p_operation: input.operationId,
  });
  return error ? failure(error) : { ok: true };
}
