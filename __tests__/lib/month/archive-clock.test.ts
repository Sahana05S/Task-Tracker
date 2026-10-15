import { afterEach,describe,expect,it,vi } from 'vitest';

const {rpc,loadPerformance,getAwards}=vi.hoisted(()=>({
 rpc:vi.fn(),loadPerformance:vi.fn(),getAwards:vi.fn(),
}));
vi.mock('@/lib/supabase/server',()=>({createClient:vi.fn(async()=>({rpc}))}));
vi.mock('@/lib/performance/queries',()=>({loadPerformance}));
vi.mock('@/lib/stars/read-model',()=>({getAwards}));
import { captureMonth } from '@/lib/month/archive';

afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();});
describe('month capture observation clock',()=>{
 it('uses a nonfuture margin for the same source and archive as-of',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-15T10:00:00.000Z'));
  const sources={sourceWatermark:'fixture'},calculation={status:'incomplete'};
  loadPerformance.mockResolvedValue({sources,calculation});
  getAwards.mockResolvedValue({monthly:{status:'incomplete',winnerId:null,counts:{}}});
  rpc.mockResolvedValue({data:{state:'closed'},error:null});
  await captureMonth('close','2026-09-01',0,'11111111-1111-4111-8111-111111111111','Synthetic incomplete month');
  expect(loadPerformance).toHaveBeenCalledWith(expect.anything(),'2026-09-01','2026-10-01','2026-10-15T09:59:50.000Z');
  expect(rpc).toHaveBeenCalledWith('month_archive_command',expect.objectContaining({
   p_payload:expect.objectContaining({sourceInputs:sources,calculation}),
  }));
 });
});
