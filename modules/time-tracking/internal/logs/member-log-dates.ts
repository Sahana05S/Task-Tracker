import { createClient } from '@/shared/supabase/server';

/**
 * Dates of a member's unreversed log entries between two dates, inclusive (one
 * entry per log, so dates repeat). Throws on a query error so the caller can
 * show it as unavailable, never as zero. PRIVATE.
 */
export async function getMemberLogDates(userId: string, from: string, to: string): Promise<string[]> {
  const db = await createClient();
  const { data, error } = await db.from('daily_task_logs').select('log_date').eq('user_id', userId)
    .gte('log_date', from).lte('log_date', to).is('reversed_at', null);
  if (error) throw error;
  return (data ?? []).map((l) => l.log_date);
}
