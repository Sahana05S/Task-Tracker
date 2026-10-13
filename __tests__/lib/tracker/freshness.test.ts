import { describe,it,expect } from 'vitest';
import { classifyFreshness, kolkataDate } from '@/lib/tasks/contract';
import { TASK_FRESHNESS_STATES } from '@/lib/tracker/enums';
const input={assignedDate:'2026-10-01',dueDate:'2026-10-10',completedDate:null,status:'In Progress' as const};
describe('approved M03 calendar freshness',()=>{
 it.each([['2026-10-04','Super Fresh'],['2026-10-05','Fresh'],['2026-10-10','Fresh'],['2026-10-12','Almost Fresh'],['2026-10-13','Almost Stale'],['2026-10-14','Almost Stale'],['2026-10-15','Stale'],['2026-10-17','Stale'],['2026-10-18','Rotten']])('classifies %s as %s',(asOf,state)=>expect(classifyFreshness(input,asOf).state).toBe(state));
 it('applies assignment override first, even with an earlier deadline',()=>expect(classifyFreshness({...input,assignedDate:'2026-10-17'},'2026-10-20').state).toBe('Super Fresh'));
 it('preserves completion classification',()=>expect(classifyFreshness({...input,status:'Done',completedDate:'2026-10-12'},'2026-11-20').state).toBe('Almost Fresh'));
 it.each([{...input,dueDate:null},{...input,assignedDate:'2026-11-01'},{...input,status:'Discarded' as const},{...input,status:'Done' as const},{...input,dueDate:'2026-02-30'}])('reports unavailable inputs',task=>expect(classifyFreshness(task,'2026-10-20').state).toBeNull());
 it('uses Asia/Kolkata date across UTC midnight boundaries',()=>expect(kolkataDate(new Date('2026-10-31T18:30:00Z'))).toBe('2026-11-01'));
 it('offers all six states',()=>expect(TASK_FRESHNESS_STATES).toHaveLength(6));
});
