import { createClient } from '@/shared/supabase/server';

/**
 * Raw team-wide `award_read_model` payload for a date range (all employees).
 * Throws on an RPC error so the caller can show it as unavailable; callers
 * validate the shape themselves. PRIVATE.
 */
export async function readTeamAwardModel(from: string, toExclusive: string): Promise<unknown> {
  const db = await createClient();
  const result = await db.rpc('award_read_model', { p_from: from, p_to_exclusive: toExclusive, p_employee: null });
  if (result.error) throw result.error;
  return result.data;
}
