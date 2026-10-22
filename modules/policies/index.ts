// PUBLIC server-side API of the policies module (migration 56). Pages read
// through here; the database enforces who may see and change what.
import { createClient } from '@/shared/supabase/server';

import { readCommendations, readPolicyList, type CommendationRow, type PolicyList } from '@/modules/policies/internal/queries';

/** Policies the viewer may see, with this period's status (managers also get counts). */
export async function getPolicies(): Promise<PolicyList> {
  return readPolicyList(await createClient());
}

/** Commendations (final "met" results) whose period ended in a date range; public within the company. */
export async function getCommendations(range: { from?: string | null; to?: string | null; employee?: string | null } = {}): Promise<CommendationRow[]> {
  return readCommendations(await createClient(), range);
}

export { handlePolicyWorkerRun } from '@/modules/policies/internal/worker';
export {
  PolicyReadError,
  type CommendationRow,
  type DueItem,
  type DueWork,
  type EvaluationRow,
  type PolicyList,
  type PolicyRow,
  type RunRow,
} from '@/modules/policies/internal/queries';
export * from '@/modules/policies/client';
