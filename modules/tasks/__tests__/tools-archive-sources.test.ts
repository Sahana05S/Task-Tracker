import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { archiveAffectsCarriedWindow,parsePerformanceSources,resolvePerformance } from '@/lib/performance/sources';
const employee='00000000-0000-0000-0000-000000000004';
describe('approved dated archive boundary',()=>{
 it.each([
  [null,'2026-10-01','2026-10-13',false],
  ['2026-10-13','2026-10-01','2026-10-13',false],
  ['2026-10-13','2026-11-01','2026-10-12',false],
  ['2026-10-13','2026-11-01','2026-10-13',true],
  ['2026-10-01','2026-10-01','2026-10-13',false],
 ] as const)('respects period end and as-of date',(date,end,asof,expected)=>expect(archiveAffectsCarriedWindow(date,end,asof)).toBe(expected));
 it('retains captured period credit when prospective transfer leaves source scale zero',()=>{
  const input=parsePerformanceSources(JSON.parse(readFileSync('docs/plans/fixtures/m07-source-fresh.json','utf8')));
  const t=input.tasks.find(t=>t.id==='10000000-0000-0000-0000-000000000001')!;
  t.scale='0';
  const m=resolvePerformance(input).members.find(m=>m.userId===employee)!;
  expect(m.factors.progress.rawValue).toBe(3.6);expect(m.factors.productivity.rawValue).toBe(.45);
  expect(m.factors.criticality.rawValue).toBe(0);expect(m.factors.freshness.rawValue).toBe(0);
 });
 it('retains completion and period earnings after archiving Done work',()=>{
  const input=parsePerformanceSources(JSON.parse(readFileSync('docs/plans/fixtures/m07-source-fresh.json','utf8')));
  const t=input.tasks.find(t=>t.id==='10000000-0000-0000-0000-000000000001')!;
  t.status='Done';t.progress='100';t.completedDate=input.asOfLocalDate;t.completionShares={[employee]:1000000};
  t.archivedEffectiveDate=input.asOfLocalDate;
  const m=resolvePerformance(input).members.find(m=>m.userId===employee)!;
  expect(m.factors.completion.rawValue).toBe(1);expect(m.factors.progress.rawValue).toBe(3.6);
  expect(m.factors.criticality.rawValue).toBe(0);expect(m.factors.freshness.rawValue).toBe(0);
 });
});
describe.each(['fresh','upgrade'])('M09 approved PostgreSQL source fixture (%s)',kind=>{
 const fixture=()=>JSON.parse(readFileSync(`docs/plans/fixtures/m09-approved-${kind}.json`,'utf8'));
 const relevant=(f:ReturnType<typeof fixture>,key:string)=>{
  const s=parsePerformanceSources(f[key]);
  s.tasks=s.tasks.filter(t=>[f.carryTaskId,f.successorTaskId].includes(t.id));
  return resolvePerformance(s).members.find(m=>m.userId===employee)!;
 };
 it('keeps prior-period factor values and old four earned units',()=>{
  const f=fixture(),before=relevant(f,'beforePeriod'),after=relevant(f,'afterPeriod');
  for(const name of ['progress','productivity','loading','criticality','freshness','completion'] as const)expect(after.factors[name].rawExact).toEqual(before.factors[name].rawExact);
  expect(after.factors.progress.rawValue).toBe(4);expect(after.factors.loading.rawValue).toBe(1);
 });
 it('uses successor workload and its prospective credit in the current period',()=>{
  const f=fixture(),after=relevant(f,'afterCurrent');
  expect(after.factors.progress.rawValue).toBe(1.2);expect(after.factors.loading.rawValue).toBe(1);
  expect(after.factors.criticality.rawValue).toBe(1); // High task weighting, one successor
  expect(f.afterCurrent.tasks.find((t:{id:string})=>t.id===f.carryTaskId).scale).toBe('10');
  expect(after.composite).toBeNull(); // Missing sales/attendance still do not certify a score.
 });
});
