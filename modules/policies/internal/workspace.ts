// PRIVATE. Everything the Policies page shows, each part read on its own so a
// failure is an explicit "unavailable" section, never an empty list.
import { settle, type Section } from '@/shared/async/settle';
import { createClient } from '@/shared/supabase/server';
import { kolkataDate } from '@/shared/time/kolkata';
import type { User } from '@/types/tracker';

import { PolicyReadError, readCommendations, readFacts, readPolicyList, readRuns, type CommendationRow, type PolicyList, type RunRow } from './queries';
import type { MemberRole } from './types';

export interface AudienceMember { id: string; name: string; role: MemberRole }

export interface PoliciesWorkspaceModel {
  /** The database predates migration 56. */
  missing: boolean;
  list: Section<PolicyList>;
  runs: Section<RunRow[]> | null;
  mine: Section<CommendationRow[]>;
  /** Active members, for the audience picker and preview (managing director only). */
  members: Section<AudienceMember[]> | null;
  today: string;
}

const isManager = (role: string) => role === 'managing_director' || role === 'project_engineer';

export async function getPoliciesWorkspace(profile: User): Promise<PoliciesWorkspaceModel> {
  const db = await createClient();
  const today = kolkataDate();
  let missing = false;
  const watch = async <T>(read: () => Promise<T>) => settle(async () => {
    try {
      return await read();
    } catch (error) {
      if (error instanceof PolicyReadError && error.missing) missing = true;
      throw error;
    }
  });
  const [list, runs, mine, members] = await Promise.all([
    watch(() => readPolicyList(db)),
    isManager(profile.role) ? watch(() => readRuns(db, 20)) : Promise.resolve(null),
    watch(() => readCommendations(db, { employee: profile.id })),
    profile.role === 'managing_director'
      ? watch(async () => (await readFacts(db, today, today)).members.map(({ userId, name, role }) => ({ id: userId, name, role })))
      : Promise.resolve(null),
  ]);
  return { missing, list, runs, mine, members, today };
}
