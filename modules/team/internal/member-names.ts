import { createClient } from '@/shared/supabase/server';

/**
 * Display names of every member the caller may see, keyed by user id. Names
 * are labels only, so a failed read gives an empty map rather than an error.
 * PRIVATE.
 */
export async function getMemberNames(): Promise<Record<string, string>> {
  const db = await createClient();
  const { data } = await db.from('users').select('id,full_name');
  return Object.fromEntries((data ?? []).map((u) => [u.id, u.full_name]));
}
