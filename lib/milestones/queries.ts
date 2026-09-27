import type { PostgrestError } from '@supabase/supabase-js';

import {
  COMPANY_MILESTONE_COLUMNS,
  COMPANY_STATEMENT_COLUMNS,
  mapCompanyMilestones,
  mapCompanyStatements,
} from '@/lib/milestones/mappers';
import { mapUser, USER_COLUMNS } from '@/lib/supabase/mappers';
import { createClient } from '@/lib/supabase/server';
import type { CompanyMilestone, CompanyStatement, User } from '@/types/tracker';

/**
 * Server-side reads for the milestones module. RLS decides what comes back;
 * these functions only shape it.
 */

/** The migration that creates the two tables this module reads. */
export const MILESTONES_MIGRATION =
  'supabase/migrations/04_milestones_and_vision.sql';

/**
 * Either the page's data, or the single recoverable reason it has none.
 *
 * A discriminated union rather than optional fields, so the page cannot render the
 * showcase against undefined data by forgetting to check a flag.
 */
export type MilestonesPageData =
  | {
      readonly status: 'ready';
      readonly statements: CompanyStatement[];
      readonly milestones: CompanyMilestone[];
      /** Member directory, for the milestone owner picker. */
      readonly members: User[];
    }
  | {
      /** The tables do not exist yet — `04` has not been applied. */
      readonly status: 'schema-missing';
      readonly migration: string;
    };

/**
 * Recognises "this table does not exist" and nothing else.
 *
 * Two codes, because the answer depends on which layer refuses first. PostgREST
 * keeps its own schema cache and answers `PGRST205` with "Could not find the table
 * … in the schema cache" before a query is ever issued; `42P01` is PostgreSQL's own
 * `undefined_table`, which is what surfaces if the cache is warm but the table has
 * gone.
 *
 * Deliberately narrow. Every other failure — a broken policy, a dropped column, a
 * network fault — must still throw, because degrading on all errors would turn a
 * real fault into a page that quietly claims leadership has written nothing.
 */
function isMissingTable(error: PostgrestError): boolean {
  return error.code === 'PGRST205' || error.code === '42P01';
}

/**
 * Loads everything the `/milestones` route renders.
 *
 * Three queries issued together, so this costs one round trip of latency. The
 * member directory is fetched separately rather than embedded through the
 * `owner_id` relationship: an embed nests a full user under every milestone and
 * re-serialises the same person once per goal they own, and the checklist only
 * needs a name it can resolve from a map.
 *
 * A missing table returns `status: 'schema-missing'` instead of throwing. This used
 * to throw, which took the whole route down with a 500 and broke navigation out of
 * it — for a setup step, that is a worse outcome than an in-page notice naming the
 * file to run. It also brings this in line with `getNavCounts`, which has always
 * degraded rather than failed. Anything else still throws.
 */
export async function getMilestonesPageData(): Promise<MilestonesPageData> {
  const supabase = await createClient();

  const [statementResult, milestoneResult, memberResult] = await Promise.all([
    supabase.from('company_statements').select(COMPANY_STATEMENT_COLUMNS),
    supabase
      .from('company_milestones')
      .select(COMPANY_MILESTONE_COLUMNS)
      // Stable base order; the checklist re-sorts by status and deadline.
      .order('created_at', { ascending: true }),
    supabase
      .from('users')
      .select(USER_COLUMNS)
      .order('full_name', { ascending: true }),
  ]);

  // Checked before the generic failures below: if the tables are absent both
  // queries fail for the same reason, and that reason has a fix the page can state.
  if (
    (statementResult.error && isMissingTable(statementResult.error)) ||
    (milestoneResult.error && isMissingTable(milestoneResult.error))
  ) {
    return { status: 'schema-missing', migration: MILESTONES_MIGRATION };
  }

  if (statementResult.error) {
    throw new Error(
      `Failed to load company statements: ${statementResult.error.message}`,
    );
  }
  if (milestoneResult.error) {
    throw new Error(
      `Failed to load company milestones: ${milestoneResult.error.message}`,
    );
  }
  if (memberResult.error) {
    throw new Error(`Failed to load members: ${memberResult.error.message}`);
  }

  return {
    status: 'ready',
    statements: mapCompanyStatements(statementResult.data),
    milestones: mapCompanyMilestones(milestoneResult.data),
    members: memberResult.data.map(mapUser),
  };
}
