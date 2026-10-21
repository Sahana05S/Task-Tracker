import { Exact } from '@/shared/math/exact';
import { createClient } from '@/shared/supabase/server';

const PAGE = 1000;

/**
 * Unreversed hours logged per member per day between two dates, inclusive,
 * keyed `userId|YYYY-MM-DD` (exact sums). Pages past the API's row cap. One
 * member only when `userId` is given. Throws on a query error so the caller
 * can show it as unavailable, never as zero. PRIVATE.
 */
export async function getMemberDayHours(from: string, to: string, userId?: string | null): Promise<Map<string, Exact>> {
  const db = await createClient();
  const totals = new Map<string, Exact>();
  for (let start = 0; ; start += PAGE) {
    let query = db.from('daily_task_logs').select('id, user_id, log_date, hours_worked')
      .gte('log_date', from).lte('log_date', to).is('reversed_at', null);
    if (userId) query = query.eq('user_id', userId);
    const { data, error } = await query.order('id').range(start, start + PAGE - 1);
    if (error) throw error;
    for (const log of data) {
      const key = `${log.user_id}|${log.log_date}`;
      totals.set(key, (totals.get(key) ?? Exact.from(0)).add(Exact.from(log.hours_worked)));
    }
    if (data.length < PAGE) return totals;
  }
}
