import 'server-only';

import { isConflictCode } from '@/shared/commands/conflict';
import { createClient } from '@/shared/supabase/server';
import { isMissingFunctionError } from '@/shared/supabase/schema-errors';

import { mapLabel, type Label, type LabelColour, type LabelSubjectKind } from './rules';

/** Label writes through label_command and label_link_command (migration 112). PRIVATE. */

/** label_command's operations; note_type_on / note_type_off since migration 126. */
export type LabelOp = 'create' | 'rename' | 'archive' | 'restore' | 'note_type_on' | 'note_type_off';

export type LabelFailure = { ok: false; error: string; code: 'forbidden' | 'validation' | 'conflict' | 'unavailable' };
type LabelResult = { ok: true; label: Label } | LabelFailure;

function failure(error: { code?: string; message: string }): LabelFailure {
  if (isMissingFunctionError(error)) return { ok: false, error: 'Labels need the latest database update (migration 112).', code: 'unavailable' };
  if (isConflictCode(error.code)) return { ok: false, error: 'This change was sent twice with different details. Try again.', code: 'conflict' };
  if (error.code === '42501') return { ok: false, error: error.message, code: 'forbidden' };
  if (['23514', '23505', 'P0002'].includes(error.code ?? '')) return { ok: false, error: error.message, code: 'validation' };
  return { ok: false, error: `The label was not saved: ${error.message}`, code: 'unavailable' };
}

function result(data: unknown, error: { code?: string; message: string } | null): LabelResult {
  if (error) return failure(error);
  const label = mapLabel(data);
  return label ? { ok: true, label } : { ok: false, error: 'Unexpected answer from the database.', code: 'unavailable' };
}

export async function runLabelCommand(input: {
  op: LabelOp; labelId: string | null; name: string | null;
  colour: LabelColour | null; description: string | null; operationId: string;
}): Promise<LabelResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('label_command', {
    p_op: input.op, p_label: input.labelId, p_name: input.name, p_colour: input.colour, p_description: input.description,
    p_operation: input.operationId,
  });
  return result(data, error);
}

export async function runLabelLinkCommand(input: {
  op: 'attach' | 'detach'; kind: LabelSubjectKind; subjectId: string; labelId: string | null; name: string | null; operationId: string;
}): Promise<LabelResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('label_link_command', {
    p_op: input.op, p_kind: input.kind, p_subject: input.subjectId, p_label: input.labelId, p_name: input.name,
    p_operation: input.operationId,
  });
  return result(data, error);
}
