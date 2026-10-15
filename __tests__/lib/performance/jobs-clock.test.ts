import { afterEach,expect,it,vi } from 'vitest';

const {loadPerformance}=vi.hoisted(()=>({loadPerformance:vi.fn()}));
vi.mock('@/lib/performance/queries',()=>({loadPerformance}));
import { runPerformanceJobs } from '@/lib/performance/jobs';

afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();});
it('observes a leased recomputation at the database clock, not the app clock',async()=>{
 // App clock 30 s ahead of the database: the database instant must still be used.
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-15T10:00:30.000Z'));
 const calculation={status:'incomplete',members:[],context:{ruleVersion:'m07-ten-factor-v1'}};
 loadPerformance.mockResolvedValue({calculation});
 const rpc=vi.fn(async(name:string)=>name==='claim_performance_jobs'?{data:[{id:'job',lease_token:'lease'}],error:null}
  :name==='observation_clock'?{data:'2026-10-15T09:59:58.123456+00:00',error:null}:{data:null,error:null});
 const outcomes=await runPerformanceJobs({rpc} as never,
  {periodStart:'2026-10-01',periodEndExclusive:'2026-11-01'},1);
 expect(loadPerformance).toHaveBeenCalledWith(expect.anything(),'2026-10-01','2026-11-01','2026-10-15T09:59:58.123Z');
 expect(outcomes).toEqual([{jobId:'job',status:'incomplete'}]);
 expect(rpc).toHaveBeenLastCalledWith('finish_performance_job',expect.objectContaining({p_error:null,p_result:calculation}));
});
