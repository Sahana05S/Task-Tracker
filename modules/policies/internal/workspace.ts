// PRIVATE. Everything the Policies page shows, each part read on its own so a
// failure is an explicit "unavailable" section, never an empty list.
import { settle, type Section } from '@/shared/async/settle';
import { createClient } from '@/shared/supabase/server';
import type { User } from '@/types/tracker';

import { PolicyReadError, readCommendations, readPolicyList, readRuns, type CommendationRow, type PolicyList, type RunRow } from './queries';
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
}

/** Active members of the company for the audience picker (the users table is readable within the company). */
async function readAudienceMembers(db: Awaited<ReturnType<typeof createClient>>): Promise<AudienceMember[]> {
  const { data, error } = await db.from('users').select('id,full_name,role').eq('is_active', true).order('full_name');
  if (error) throw new Error(`Members could not be read: ${error.message}`);
  return data.map((u) => ({ id: u.id, name: u.full_name, role: u.role }));
}

const isManager = (role: string) => role === 'managing_director' || role === 'project_engineer';

export async function getPoliciesWorkspace(profile: User): Promise<PoliciesWorkspaceModel> {
  const db = await createClient();
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
      ? settle(() => readAudienceMembers(db))
      : Promise.resolve(null),
  ]);
  return { missing, list, runs, mine, members };
}
