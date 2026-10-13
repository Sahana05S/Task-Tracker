import {it,expect} from 'vitest';
import {UnmeasuredProgressError} from '@/lib/analytics/availability';
import {optionalEmployeePerformance} from '@/lib/team/performance-availability';
it('allows archive reads with an explicit unavailable live performance result',async()=>{
 const result=await optionalEmployeePerformance(async()=>{throw new UnmeasuredProgressError()},'employee');
 expect(result.performance).toBeNull();expect(result.performanceUnavailableReason).toContain('unknown');
});
it('does not hide permission or database failures as missing performance',async()=>{
 await expect(optionalEmployeePerformance(async()=>{throw new Error('Forbidden')},'employee')).rejects.toThrow('Forbidden');
});
