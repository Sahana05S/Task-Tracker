import { createClient } from '@/shared/supabase/server';

/**
 * Milestones not yet achieved, for the nav badge. Reads zero on failure,
 * including before `04_milestones_and_vision.sql` is applied. PRIVATE.
 */
export async function countOpenMilestones(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from('company_milestones')
    .select('id', { count: 'exact', head: true })
    .neq('status', 'Achieved');
  return count ?? 0;
}
