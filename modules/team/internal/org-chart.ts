import { createClient } from '@/shared/supabase/server';

import { parseOrgChart, type OrgChart } from './org-tree';

/**
 * Reads the company org chart (migration 65's `org_chart()`). PRIVATE.
 * The function is the permission boundary: any active member of the company,
 * with today's status coarse only. `available` is false on a database before
 * 65, so the page can say so instead of showing an empty chart.
 */
export async function readOrgChart(): Promise<OrgChart & { available: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('org_chart');
  if (error) {
    // PGRST202: the function is not in this database yet.
    if (error.code === 'PGRST202' || error.code === '42883') return { date: null, people: [], available: false };
    throw new Error(`The org chart could not be loaded: ${error.message}`);
  }
  return { ...parseOrgChart(data), available: true };
}
