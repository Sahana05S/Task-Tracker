import type { createClient } from '@/lib/supabase/server';
import type { Json } from '@/types/database';
import { loadPerformance } from './queries';
import { LIVE_AS_OF_LAG_MS } from '@/lib/presentation/context';
/** Server-side entry point with an explicitly supplied narrow service client; no credential or scheduler here. */
export async function runPerformanceJobs(db:Awaited<ReturnType<typeof createClient>>,context:{periodStart:string;periodEndExclusive:string},limit=10) {
  const claim=await db.rpc('claim_performance_jobs',{p_limit:limit});if(claim.error)throw new Error(`Performance job claim failed: ${claim.error.message}`);
  if(!Array.isArray(claim.data))throw new Error('Performance lease response unavailable.');
  const outcomes:{jobId:string;status:string}[]=[];
  for(const item of claim.data){
    if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.id!=='string'||typeof item.lease_token!=='string')throw new Error('Invalid job lease.');
    let result:Json|null=null,errorCode:string|null=null;
    try{result=(await loadPerformance(db,context.periodStart,context.periodEndExclusive,new Date(Date.now()-LIVE_AS_OF_LAG_MS).toISOString())).calculation as unknown as Json;}catch{errorCode='source_query_failed';}
    let finish=await db.rpc('finish_performance_job',{p_job:item.id,p_lease:item.lease_token,p_result:result,p_error:errorCode});
    if(finish.error){const code=finish.error.code==='40001'?'source_changed':finish.error.code==='23514'?'frozen_period':'calculation_failed';finish=await db.rpc('finish_performance_job',{p_job:item.id,p_lease:item.lease_token,p_result:null,p_error:code});errorCode=code;}
    if(finish.error)throw new Error(`Performance job outcome could not be recorded: ${finish.error.message}`);
    outcomes.push({jobId:item.id,status:errorCode??(result as unknown as {status:string}).status});
  }return outcomes;
}
