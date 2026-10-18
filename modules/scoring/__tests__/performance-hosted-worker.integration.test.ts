/** Opt-in M13 hosted integration; skipped by the ordinary unit suite. */
import { createClient } from '@supabase/supabase-js';
import { expect,it } from 'vitest';
import { runPerformanceJobs } from '@/modules/scoring/internal/performance/jobs';
import { calculateAward } from '@/modules/scoring/internal/stars/calculation';
import type { Database } from '@/types/database';

const ref='ngpmwzksekkpvrgoqngk';
it.skipIf(process.env.M13_TEST_REF!==ref)('delivers a real performance job with unavailable sales',async()=>{
 const key=process.env.M13_TEST_SERVICE_KEY;
 if(!key)throw new Error('Test-only service key missing');
 const db=createClient<Database>(`https://${ref}.supabase.co`,key,
  {auth:{persistSession:false,autoRefreshToken:false}});
 const outcomes=await runPerformanceJobs(db as never,
  {periodStart:'2026-10-01',periodEndExclusive:'2026-11-01'},1);
 expect(outcomes).toHaveLength(1);
 expect(outcomes[0].status).toBe('incomplete');
});
it.skipIf(process.env.M13_TEST_REF!==ref)('resolves the prior-day missing-source award',async()=>{
 const key=process.env.M13_TEST_SERVICE_KEY;
 if(!key)throw new Error('Test-only service key missing');
 const db=createClient<Database>(`https://${ref}.supabase.co`,key,
  {auth:{persistSession:false,autoRefreshToken:false}});
 const policy=await db.rpc('award_policy_context',{});
 expect(policy.error).toBeNull();
 const result=await calculateAward(db as never,'2026-10-14',
  new Date(Date.now()-10_000).toISOString(),
  (policy.data as {policy:Parameters<typeof calculateAward>[3]}).policy,true);
 expect(result.status).toBe('blocked');
 expect(result.winnerId).toBeNull();
});
