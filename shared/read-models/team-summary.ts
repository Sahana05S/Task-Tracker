import { cache } from 'react';

import { createClient } from '@/shared/supabase/server';
import type { Json } from '@/types/database';

/**
 * The raw monthly `team_summary_inputs` result (migration 11): per-member logs,
 * attendance counts and report counts. It is a cross-domain read model, so the
 * fetch lives here and each consumer parses the part it owns (scoring parses
 * logs and attendance; support reads the report summary). `cache` makes every
 * consumer in one request share a single database call.
 */
export const fetchTeamSummary = cache(async (year: number, month: number): Promise<Json> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('team_summary_inputs', { p_year: year, p_month: month });
  if (error) throw new Error(`Failed to load team summary: ${error.message}`);
  return data;
});
