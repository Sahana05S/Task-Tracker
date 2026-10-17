import { afterEach,expect,it,vi } from 'vitest';

const {loadAttendanceContext,from,rpc}=vi.hoisted(()=>({loadAttendanceContext:vi.fn(),from:vi.fn(),rpc:vi.fn()}));
vi.mock('@/modules/support',()=>({loadAttendanceContext}));
vi.mock('@/shared/supabase/server',()=>({createClient:vi.fn(async()=>({from,rpc}))}));
vi.mock('@/shared/supabase/mappers',()=>({USER_COLUMNS:'*',mapUser:(row:{id:string})=>row}));
import { getAttendanceModuleData } from '@/lib/attendance/queries';

function chain(data:unknown[]){
 const q={select:()=>q,gte:()=>q,lte:()=>q,order:()=>q,eq:()=>q,
  then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data,error:null}).then(resolve)};
 return q;
}
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();});
it('requests attendance inputs at the database clock, so a just-saved record is included',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-15T10:00:30.000Z'));
 from.mockImplementation((table:string)=>chain(table==='users'?[{id:'member'}]:[]));
 rpc.mockResolvedValue({data:'2026-10-15T09:59:58.123456+00:00',error:null});
 loadAttendanceContext.mockResolvedValue({});
 await getAttendanceModuleData({startDate:'2026-10-01',endDate:'2026-10-31',viewerId:'member',canManage:false});
 expect(rpc).toHaveBeenCalledWith('observation_clock');
 expect(loadAttendanceContext).toHaveBeenCalledWith(expect.anything(),'member','2026-10-01','2026-11-01','2026-10-15T09:59:58.123Z');
});
