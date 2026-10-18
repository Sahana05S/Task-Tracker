import { afterEach,describe,expect,it,vi } from 'vitest';

const {rpc,loadPerformance,getAwards}=vi.hoisted(()=>({
 rpc:vi.fn(),loadPerformance:vi.fn(),getAwards:vi.fn(),
}));
vi.mock('@/shared/supabase/server',()=>({createClient:vi.fn(async()=>({rpc}))}));
vi.mock('@/modules/scoring/internal/performance/queries',()=>({loadPerformance}));
vi.mock('@/modules/scoring/internal/stars/read-model',()=>({getAwards}));
import { captureMonth } from '@/lib/month/archive';

afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();});
describe('month capture observation clock',()=>{
 it('captures sources and archive at the same database-clock as-of',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-15T10:00:30.000Z'));
  const sources={sourceWatermark:'fixture'},calculation={status:'incomplete'};
  loadPerformance.mockResolvedValue({sources,calculation});
  getAwards.mockResolvedValue({monthly:{status:'incomplete',winnerId:null,counts:{}}});
  rpc.mockImplementation(async(name:string)=>name==='observation_clock'
   ?{data:'2026-10-15T09:59:58.123456+00:00',error:null}:{data:{state:'closed'},error:null});
  await captureMonth('close','2026-09-01',0,'11111111-1111-4111-8111-111111111111','Synthetic incomplete month');
  expect(loadPerformance).toHaveBeenCalledWith(expect.anything(),'2026-09-01','2026-10-01','2026-10-15T09:59:58.123Z');
  expect(rpc).toHaveBeenCalledWith('month_archive_command',expect.objectContaining({
   p_payload:expect.objectContaining({sourceInputs:sources,calculation}),
  }));
 });
});
