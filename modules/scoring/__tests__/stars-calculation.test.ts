import { afterEach,describe,it,expect,vi } from 'vitest';
import { calculateAward } from '@/modules/scoring/internal/stars/calculation';
import { loadPerformance } from '@/modules/scoring/internal/performance/queries';
vi.mock('@/modules/scoring/internal/performance/queries',()=>({loadPerformance:vi.fn()}));
afterEach(()=>vi.resetAllMocks());
const observed={sources:{members:[],attendance:[],sourceWatermark:'fixture'},calculation:{status:'incomplete',members:[],reasons:['empty_member_population'],context:{}}};
describe('M08 approved source observation context',()=>{
 it('waits for end-of-day without pretending partial measurements are an award',async()=>{const r=await calculateAward({} as never,'2026-10-12','2026-10-12T12:00:00.000Z');expect(r.status).toBe('blocked');expect(r.reasons).toEqual(['award_cutoff_not_reached']);expect(loadPerformance).not.toHaveBeenCalled();});
 it('initial calculations read the sources as of the run, after the nightly attendance fill (decision 25 Oct 2026)',async()=>{vi.mocked(loadPerformance).mockResolvedValue(observed as never);const r=await calculateAward({} as never,'2026-10-12','2026-10-13T00:05:00.000Z');expect(r.context).toMatchObject({asOf:'2026-10-13T00:05:00.000Z',cutoff:'2026-10-12T18:29:59.999Z',periodEndExclusive:'2026-10-13'});expect(loadPerformance).toHaveBeenNthCalledWith(1,{},'2026-10-01','2026-10-13','2026-10-13T00:05:00.000Z');});
 it('retained correction revisions use the new observed as-of and retain the date/window',async()=>{vi.mocked(loadPerformance).mockResolvedValue(observed as never);const r=await calculateAward({} as never,'2026-10-12','2026-10-14T00:05:00.000Z',undefined,true);expect(r.context).toMatchObject({businessDate:'2026-10-12',asOf:'2026-10-14T00:05:00.000Z',periodStart:'2026-10-01',periodEndExclusive:'2026-10-13'});});
});
