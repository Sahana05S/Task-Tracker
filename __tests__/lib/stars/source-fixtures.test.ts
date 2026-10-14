import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePerformanceSources,resolvePerformance } from '@/lib/performance/sources';
import { selectDaily } from '@/lib/stars/contract';
describe.each(['fresh','upgrade'])('M08 approved PostgreSQL source safeguards (%s)',kind=>{
 it('keeps actual missing MTD attendance/sales unavailable and never certifies a daily winner',()=>{
  const sources=parsePerformanceSources(JSON.parse(readFileSync(`docs/plans/fixtures/m08-approved-source-${kind}.json`,'utf8'))),calculation=resolvePerformance(sources);
  expect(calculation.context.periodStart.endsWith('-01')).toBe(true);expect(calculation.context.windows.progress).toBe('period_earned');expect(calculation.members.length).toBe(7);
  const employee=calculation.members.find(m=>m.userId==='00000000-0000-0000-0000-000000000004')!;
  expect(employee.factors.sales.rawValue).toBeNull();expect(employee.factors.productivity.rawValue).toBeNull();expect(employee.factors.criticality.rawValue).toBe(0);expect(employee.factors.loading.rawValue).toBeNull();
  const result=selectDaily(calculation,calculation.members.map(m=>({userId:m.userId,state:'unavailable',reasons:['attendance_evidence_unavailable']})));
  expect(result.status).toBe('blocked');expect(result.winnerId).toBeNull();expect(employee.composite).toBeNull();
 });
});
