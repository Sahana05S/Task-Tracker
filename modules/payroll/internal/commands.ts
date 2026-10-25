import 'server-only';

import { isConflictCode } from '@/shared/commands/conflict';
import { createClient } from '@/shared/supabase/server';
import { isMissingFunctionError } from '@/shared/supabase/schema-errors';

import type { PayrollCommandInput, PayrollMonthCommandInput } from './input';

/**
 * Runs `payroll_command` and `payroll_month_command` (migration 74). PRIVATE.
 * The functions are the permission boundary (active managing director of the
 * caller's company), check the expected version and are idempotent per
 * operation id.
 */

type CommandResult = { ok: true; version: number } | { ok: false; error: string };

function failure(error: { code?: string; message: string }, conflict: string): CommandResult {
  if (isConflictCode(error.code)) return { ok: false, error: conflict };
  if (isMissingFunctionError(error)) return { ok: false, error: 'Payroll needs the latest database update (migration 74).' };
  // The functions raise plain-language messages for refusals and invalid input.
  if (['42501', '23505', '23514', 'P0002'].includes(error.code ?? '')) return { ok: false, error: error.message };
  return { ok: false, error: `The change was not saved: ${error.message}` };
}

function version(data: unknown): CommandResult {
  const value = typeof data === 'object' && data !== null && 'version' in data ? Number((data as { version: unknown }).version) : NaN;
  return Number.isInteger(value) ? { ok: true, version: value } : { ok: false, error: 'The database returned an unexpected answer.' };
}

export async function runPayrollCommand(input: PayrollCommandInput): Promise<CommandResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('payroll_command', {
    p_section: input.section,
    p_payload: input.payload,
    p_expected_version: input.expectedVersion,
    p_operation: input.operationId,
  });
  return error ? failure(error, 'This pay file was changed meanwhile. Reload the page to see the change, then save again.') : version(data);
}

export async function runPayrollMonthCommand(input: PayrollMonthCommandInput): Promise<CommandResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('payroll_month_command', {
    p_action: input.action,
    p_period: input.period,
    p_reason: input.reason,
    p_expected_version: input.expectedVersion,
    p_operation: input.operationId,
  });
  return error ? failure(error, 'This month was changed meanwhile. Reload the page and try again.') : version(data);
}
