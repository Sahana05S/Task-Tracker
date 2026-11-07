import 'server-only';

import { createClient } from '@/shared/supabase/server';

import { mapCatalogue, mapIds, mapSummary, type BusinessCatalogue, type BusinessSummary } from './rules';

/**
 * Business reads (migration 134). PRIVATE. Each returns null when the database
 * predates 134 or the read fails, so pages render without chips instead of breaking.
 */

export async function getBusinesses(): Promise<BusinessCatalogue | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('businesses');
  return error ? null : mapCatalogue(data);
}

/** The caller's own active businesses, in chip order. */
export async function getMyBusinessIds(): Promise<string[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('my_businesses');
  return error ? null : mapIds(data);
}

/** Open and permanent missions and this week's hours per business. */
export async function getBusinessSummary(): Promise<BusinessSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('business_summary');
  return error ? null : mapSummary(data);
}

/** Everything the chips need: the list, the caller's own businesses and the summary; null when businesses are unavailable. */
export async function getBusinessView(): Promise<{ catalogue: BusinessCatalogue; mine: string[]; summary: BusinessSummary | null } | null> {
  const [catalogue, mine, summary] = await Promise.all([
    getBusinesses(),
    getMyBusinessIds(),
    getBusinessSummary().catch(() => null),
  ]);
  return catalogue ? { catalogue, mine: mine ?? [], summary } : null;
}
