import 'server-only';

import { isConflictCode } from '@/shared/commands/conflict';
import { createClient } from '@/shared/supabase/server';
import { isMissingFunctionError } from '@/shared/supabase/schema-errors';

import type { SettingsCommandInput } from './input';

/**
 * Runs `company_settings_command` (migration 53). PRIVATE. The function is the
 * permission boundary (active managing director of the caller's company),
 * checks the expected version and is idempotent per operation id.
 */
export async function runSettingsCommand(input: SettingsCommandInput): Promise<{ ok: true; version: number } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('company_settings_command', {
    p_section: input.section,
    p_payload: input.payload,
    p_expected_version: input.expectedVersion,
    p_operation: input.operationId,
  });
  if (error) {
    if (isConflictCode(error.code)) return { ok: false, error: 'Someone else saved company settings meanwhile. Reload the page to see their change, then save again.' };
    if (isMissingFunctionError(error)) return { ok: false, error: 'Company settings need the latest database update (migration 53).' };
    // The command raises plain-language messages for refusals and invalid input.
    if (error.code === '42501' || error.code === '23505' || error.code === '23514') return { ok: false, error: error.message };
    return { ok: false, error: `The change was not saved: ${error.message}` };
  }
  const version = typeof data === 'object' && data !== null && 'version' in data ? Number((data as { version: unknown }).version) : NaN;
  return Number.isInteger(version) ? { ok: true, version } : { ok: false, error: 'The database returned an unexpected answer.' };
}
