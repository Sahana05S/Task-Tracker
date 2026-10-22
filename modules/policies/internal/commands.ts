// PRIVATE. The one write path: public.policy_command (migration 56).
import type { Json } from '@/types/database';

import type { Db } from './queries';

export type PolicyCommandName = 'create' | 'revise' | 'activate' | 'deactivate' | 'archive' | 'record_run' | 'record_failure';

/** A refusal from the database, with its SQLSTATE (PT409 conflict, 42501 refused, 23514 invalid). */
export class PolicyCommandError extends Error {
  constructor(message: string, readonly code: string | null) {
    super(message);
  }
}

export async function policyCommand<T>(db: Db, command: PolicyCommandName, payload: Record<string, unknown>, operationId: string): Promise<T> {
  const { data, error } = await db.rpc('policy_command', { p_command: command, p_payload: payload as unknown as Json, p_operation: operationId });
  if (error) throw new PolicyCommandError(error.message, error.code ?? null);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new PolicyCommandError('Unexpected policy command response. Retry with the same operation to recover the committed result.', null);
  }
  return data as unknown as T;
}
