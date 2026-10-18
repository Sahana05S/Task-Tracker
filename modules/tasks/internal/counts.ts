import { createClient } from '@/shared/supabase/server';

/**
 * Tasks still in play across the team (not Done, not Discarded), for the nav
 * badge. Head-only exact count; a failure reads as zero because a badge must
 * never break a page. PRIVATE.
 */
export async function countOpenTasks(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .not('status', 'in', '("Done","Discarded")');
  return count ?? 0;
}
