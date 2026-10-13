import type { createClient } from '@/lib/supabase/server';
import { parsePerformanceSources,resolvePerformance } from './sources';
type Client=Awaited<ReturnType<typeof createClient>>;
export async function loadPerformance(db:Client,periodStart:string,periodEndExclusive:string,asOf:string) {
  const {data,error}=await db.rpc('performance_source_context',{p_from:periodStart,p_to_exclusive:periodEndExclusive,p_as_of:asOf});
  if(error)throw new Error(`Performance source query failed: ${error.message}`);
  const sources=parsePerformanceSources(data);
  return {sources,calculation:resolvePerformance(sources)};
}
