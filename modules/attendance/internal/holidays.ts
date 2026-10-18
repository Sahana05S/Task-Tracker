import 'server-only';

import { createClient } from '@/shared/supabase/server';

/**
 * Dates in [from, to] on which every active member has an active Holiday
 * attendance record (migration 37). A display marker for the daily star log;
 * it changes no attendance or award rule. Null when the database predates 37.
 */
export async function getTeamHolidayDates(from: string, to: string): Promise<ReadonlySet<string> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('team_holiday_dates', { p_from: from, p_to: to });
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') return null;
    throw new Error(`Failed to load team holidays: ${error.message}`);
  }
  return new Set((data ?? []) as string[]);
}
