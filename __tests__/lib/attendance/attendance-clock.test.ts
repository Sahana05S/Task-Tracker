import { afterEach,expect,it,vi } from 'vitest';

const {loadAttendanceContext,from}=vi.hoisted(()=>({loadAttendanceContext:vi.fn(),from:vi.fn()}));
vi.mock('@/lib/support/input-context',()=>({loadAttendanceContext}));
vi.mock('@/lib/supabase/server',()=>({createClient:vi.fn(async()=>({from}))}));
vi.mock('@/lib/supabase/mappers',()=>({USER_COLUMNS:'*',mapUser:(row:{id:string})=>row}));
import { getAttendanceModuleData } from '@/lib/attendance/queries';

function chain(data:unknown[]){
 const q={select:()=>q,gte:()=>q,lte:()=>q,order:()=>q,eq:()=>q,
  then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data,error:null}).then(resolve)};
 return q;
}
afterEach(()=>{vi.useRealTimers();vi.clearAllMocks();});
it('requests attendance inputs at a nonfuture observation time',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-15T10:00:00.000Z'));
 from.mockImplementation((table:string)=>chain(table==='users'?[{id:'member'}]:[]));
 loadAttendanceContext.mockResolvedValue({});
 await getAttendanceModuleData({startDate:'2026-10-01',endDate:'2026-10-31',viewerId:'member',canManage:false});
 expect(loadAttendanceContext).toHaveBeenCalledWith(expect.anything(),'member','2026-10-01','2026-11-01','2026-10-15T09:59:50.000Z');
});
