import { afterEach,describe,it,expect,vi } from 'vitest';
import { calculateAward } from '@/lib/stars/calculation';
import { loadPerformance } from '@/lib/performance/queries';
vi.mock('@/lib/performance/queries',()=>({loadPerformance:vi.fn()}));
afterEach(()=>vi.resetAllMocks());
const observed={sources:{members:[],attendance:[],sourceWatermark:'fixture'},calculation:{status:'incomplete',members:[],reasons:['empty_member_population'],context:{}}};
describe('M08 approved source observation context',()=>{
 it('waits for end-of-day without pretending partial measurements are an award',async()=>{const r=await calculateAward({} as never,'2026-10-12','2026-10-12T12:00:00.000Z');expect(r.status).toBe('blocked');expect(r.reasons).toEqual(['award_cutoff_not_reached']);expect(loadPerformance).not.toHaveBeenCalled();});
 it('initial calculations observe the actual award-day cutoff, not later worker execution',async()=>{vi.mocked(loadPerformance).mockResolvedValue(observed as never);const r=await calculateAward({} as never,'2026-10-12','2026-10-13T00:05:00.000Z');expect(r.context.asOf).toBe('2026-10-12T18:29:59.999Z');expect(loadPerformance).toHaveBeenNthCalledWith(1,{},'2026-10-01','2026-10-13','2026-10-12T18:29:59.999Z');});
 it('retained correction revisions use the new observed as-of and retain the date/window',async()=>{vi.mocked(loadPerformance).mockResolvedValue(observed as never);const r=await calculateAward({} as never,'2026-10-12','2026-10-14T00:05:00.000Z',undefined,true);expect(r.context).toMatchObject({businessDate:'2026-10-12',asOf:'2026-10-14T00:05:00.000Z',periodStart:'2026-10-01',periodEndExclusive:'2026-10-13'});});
});
