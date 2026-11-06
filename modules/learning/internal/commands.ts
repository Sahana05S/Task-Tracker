import 'server-only';

import { createClient } from '@/shared/supabase/server';
import type { ActionResponse } from '@/types/tracker';

export interface NoteCommandInput {
  op: 'add' | 'edit' | 'delete';
  taskId: string;
  noteId: string | null;
  nodeId: string | null;
  body: string | null;
  labelIds: string[];
  newLabels: string[];
  operationId: string;
}

/** mission_note_command (migration 132). PRIVATE. */
export async function runNoteCommand(input: NoteCommandInput): Promise<ActionResponse<unknown>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mission_note_command', {
    p_op: input.op, p_task: input.taskId, p_note: input.noteId, p_node: input.nodeId, p_body: input.body,
    p_labels: input.labelIds, p_new_labels: input.newLabels, p_operation: input.operationId,
  });
  return error ? { success: false, error: error.message } : { success: true, data };
}
