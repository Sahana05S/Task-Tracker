import 'server-only';

import { isConflictCode } from '@/shared/commands/conflict';
import { createClient } from '@/shared/supabase/server';
import { isMissingFunctionError } from '@/shared/supabase/schema-errors';

import type { LearningKind } from './rules';

/** Mistakes and learning writes through mission_learning_command (migration 111). PRIVATE. */

export type LearningFailure = { ok: false; error: string; code: 'forbidden' | 'validation' | 'conflict' | 'unavailable' };

export interface LearningCommand {
  readonly op: 'add' | 'edit' | 'withdraw';
  readonly taskId: string;
  readonly learningId: string | null;
  readonly kind: LearningKind | null;
  readonly body: string | null;
  readonly operationId: string;
}

function failure(error: { code?: string; message: string }): LearningFailure {
  if (isMissingFunctionError(error)) return { ok: false, error: 'Mistakes and learning need the latest database update (migration 111).', code: 'unavailable' };
  if (isConflictCode(error.code)) return { ok: false, error: 'This change was sent twice with different details. Try again.', code: 'conflict' };
  if (error.code === '42501') return { ok: false, error: error.message, code: 'forbidden' };
  if (['23514', 'P0002'].includes(error.code ?? '')) return { ok: false, error: error.message, code: 'validation' };
  return { ok: false, error: `The note was not saved: ${error.message}`, code: 'unavailable' };
}

export async function runLearningCommand(input: LearningCommand): Promise<{ ok: true } | LearningFailure> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('mission_learning_command', {
    p_op: input.op, p_task: input.taskId, p_learning: input.learningId, p_kind: input.kind, p_body: input.body,
    p_operation: input.operationId,
  });
  return error ? failure(error) : { ok: true };
}
