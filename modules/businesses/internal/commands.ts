import 'server-only';

import { isConflictCode } from '@/shared/commands/conflict';
import { createClient } from '@/shared/supabase/server';
import { isMissingFunctionError } from '@/shared/supabase/schema-errors';

import { mapBusiness, mapIds, type Business, type BusinessColour } from './rules';

/** Business writes through business_command, user_businesses_command and task_business_command (migration 134). PRIVATE. */

export type BusinessOp = 'create' | 'update' | 'archive' | 'restore';
export type BusinessFailure = { ok: false; error: string; code: 'forbidden' | 'validation' | 'conflict' | 'unavailable' };

function failure(error: { code?: string; message: string }): BusinessFailure {
  if (isMissingFunctionError(error)) return { ok: false, error: 'Businesses need the latest database update (migration 134).', code: 'unavailable' };
  if (isConflictCode(error.code)) return { ok: false, error: 'This change was sent twice with different details. Try again.', code: 'conflict' };
  if (error.code === '42501') return { ok: false, error: error.message, code: 'forbidden' };
  if (['23514', '23505', 'P0002'].includes(error.code ?? '')) return { ok: false, error: error.message, code: 'validation' };
  return { ok: false, error: `The change was not saved: ${error.message}`, code: 'unavailable' };
}

export async function runBusinessCommand(input: {
  op: BusinessOp; businessId: string | null; name: string | null; colour: BusinessColour | null; sort: number | null; operationId: string;
}): Promise<{ ok: true; business: Business } | BusinessFailure> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('business_command', {
    p_op: input.op, p_business: input.businessId, p_name: input.name, p_colour: input.colour, p_sort: input.sort,
    p_operation: input.operationId,
  });
  if (error) return failure(error);
  const business = mapBusiness({ ...(data as object), memberIds: [] });
  return business ? { ok: true, business } : { ok: false, error: 'Unexpected answer from the database.', code: 'unavailable' };
}

export async function runUserBusinessesCommand(input: {
  userId: string; businessIds: string[]; operationId: string;
}): Promise<{ ok: true; businessIds: string[] } | BusinessFailure> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('user_businesses_command', {
    p_user: input.userId, p_businesses: input.businessIds, p_operation: input.operationId,
  });
  if (error) return failure(error);
  return { ok: true, businessIds: mapIds((data as { businessIds?: unknown } | null)?.businessIds) };
}

export async function runTaskBusinessCommand(input: {
  taskId: string; businessId: string | null; operationId: string;
}): Promise<{ ok: true; businessId: string | null } | BusinessFailure> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('task_business_command', {
    p_task: input.taskId, p_business: input.businessId, p_operation: input.operationId,
  });
  if (error) return failure(error);
  const saved = (data as { businessId?: unknown } | null)?.businessId;
  return { ok: true, businessId: typeof saved === 'string' ? saved : null };
}
