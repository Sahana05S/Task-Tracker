import { createClient } from '@/shared/supabase/server';
import type { AnalyticsPeriod } from '@/shared/time/period';

/** A member's own log entries in a period, for the nav badge; failures read as zero. PRIVATE. */
export async function countMyLogsInPeriod(userId: string, period: AnalyticsPeriod): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from('daily_task_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('log_date', period.startDate)
    .lte('log_date', period.endDate);
  return count ?? 0;
}
