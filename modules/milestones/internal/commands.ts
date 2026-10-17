import type { PostgrestError } from '@supabase/supabase-js';

import type {
  MilestoneFields,
  StatementFields,
} from '@/modules/milestones/internal/input';
import { createClient } from '@/shared/supabase/server';

/**
 * Writes to `company_statements` and `company_milestones`. PRIVATE.
 *
 * Each command returns either its result or a message the form can show. RLS
 * (`Leadership can manage …`) refuses the write if the role check was bypassed.
 */

type CommandResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Turns a PostgREST error into something a user can act on.
 *
 * `42501` is the one that matters: it is what RLS returns when a policy refuses
 * the write, and it is the signal that the role check was circumvented or has
 * drifted out of step with the policies.
 */
function describeDatabaseError(error: PostgrestError): string {
  switch (error.code) {
    case '23505':
      return 'That statement key is already in use.';
    case '23503':
      return 'The selected owner no longer exists.';
    case '23514':
      return 'A count is outside its permitted range.';
    case '42501':
      return 'You do not have permission to perform that change.';
    // PGRST205 is PostgREST's schema-cache miss, 42P01 PostgreSQL's own
    // undefined_table. Either means migration 04 has not been applied.
    case 'PGRST205':
    case '42P01':
      return 'The milestones tables are missing. Apply supabase/migrations/04_milestones_and_vision.sql.';
    default:
      return error.message;
  }
}

/** Rewrites one statement block: vision, mission or core values. */
export async function updateStatementRow(
  fields: StatementFields,
  updatedBy: string,
): Promise<CommandResult<null>> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('company_statements')
    .update({
      title: fields.title,
      statement: fields.statement,
      subtext: fields.subtext,
      // updated_at is maintained by trg_company_statements_set_updated_at.
      updated_by: updatedBy,
    })
    .eq('id', fields.statementId);

  return error ? { ok: false, error: describeDatabaseError(error) } : { ok: true, value: null };
}

export async function insertMilestone(
  fields: MilestoneFields,
): Promise<CommandResult<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('company_milestones')
    .insert(fields)
    .select('id')
    .single();

  return error ? { ok: false, error: describeDatabaseError(error) } : { ok: true, value: data.id };
}

export async function updateMilestoneRow(
  milestoneId: string,
  fields: MilestoneFields,
): Promise<CommandResult<null>> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('company_milestones')
    .update(fields)
    .eq('id', milestoneId);

  return error ? { ok: false, error: describeDatabaseError(error) } : { ok: true, value: null };
}

/**
 * Removes a milestone outright. The table keeps no history and nothing
 * references a milestone, so there is nothing to cascade or restore from.
 */
export async function deleteMilestoneRow(
  milestoneId: string,
): Promise<CommandResult<null>> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('company_milestones')
    .delete()
    .eq('id', milestoneId);

  return error ? { ok: false, error: describeDatabaseError(error) } : { ok: true, value: null };
}
