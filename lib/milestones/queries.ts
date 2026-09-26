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

export interface MilestonesPageData {
  statements: CompanyStatement[];
  milestones: CompanyMilestone[];
  /** Member directory, for the milestone owner picker. */
  members: User[];
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
 * Failures throw rather than degrading to empty, matching
 * `getTaskWorkspaceData`. The most likely cause is that
 * `04_milestones_and_vision.sql` has not been applied, and rendering a blank page
 * would present a setup problem as though leadership had simply written nothing.
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

  if (statementResult.error) {
    throw new Error(
      `Failed to load company statements: ${statementResult.error.message}. ` +
        'Has supabase/migrations/04_milestones_and_vision.sql been applied?',
    );
  }
  if (milestoneResult.error) {
    throw new Error(
      `Failed to load company milestones: ${milestoneResult.error.message}. ` +
        'Has supabase/migrations/04_milestones_and_vision.sql been applied?',
    );
  }
  if (memberResult.error) {
    throw new Error(`Failed to load members: ${memberResult.error.message}`);
  }

  return {
    statements: mapCompanyStatements(statementResult.data),
    milestones: mapCompanyMilestones(milestoneResult.data),
    members: memberResult.data.map(mapUser),
  };
}
