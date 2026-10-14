import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parsePerformanceSources,resolvePerformance,type PerformancePolicy } from '@/lib/performance/sources';
import { computeTeamAnalytics } from '@/lib/analytics/engine';
import { optionalEmployeePerformance } from '@/lib/team/performance-availability';
import { performanceReport } from '@/lib/performance/report';
import type { User } from '@/types/tracker';
const policy:PerformancePolicy={id:'independent-fixture-policy',taskPopulation:'eligible_carried_asof',progressWindow:'period_earned',completion:'done_in_period',nonadditiveAttribution:'normalized_shares',observedZeroInMedian:true,missingPolicy:'exclude_unavailable',precisionPolicy:'fixture-exact',displayPlaces:2};
const employee='00000000-0000-0000-0000-000000000004',other='00000000-0000-0000-0000-000000000008';
describe.each(['fresh','upgrade'])('M07 PostgreSQL source conformance (%s)',kind=>{
 const sources=()=>parsePerformanceSources(JSON.parse(readFileSync(`docs/plans/fixtures/m07-source-${kind}.json`,'utf8')));
 it('preserves literal original-scale/share correction results and actual manual credit without extra effort',()=>{
  const input=sources(),result=resolvePerformance(input,policy),a=result.members.find(m=>m.userId===employee)!,b=result.members.find(m=>m.userId===other)!;
  expect(a.factors.progress.rawValue).toBe(3.6);expect(b.factors.progress.rawValue).toBe(1.2);
  expect(a.factors.productivity.rawValue).toBe(.45);expect(a.factors.criticality.rawValue).toBe(.5);expect(b.factors.criticality.rawValue).toBe(.5);
  expect(a.factors.loading.rawValue).toBe(.5);expect(a.factors.freshness.rawValue).toBe(1.5);
  expect(a.factors.facts.rawValue).toBe(.75);expect(a.factors.sales.rawValue).toBeNull();expect(a.composite).toBeNull();
  expect(input.tasks.find(t=>t.id==='10000000-0000-0000-0000-000000000001')!.taskHours).toBe('3');
 });
 it('dashboard, profile and report preserve the identical shared result/context',async()=>{
  const input=sources(),calculation=resolvePerformance(input,policy),period={year:2026,month:10,startDate:input.periodStart,endDate:input.periodEndExclusive,label:'Fixture period'};
  const users=input.members.map(m=>({id:m.id,fullName:m.fullName,employeeId:m.employeeId,role:m.role,isActive:m.active}) as User);
  // A currently inactive account must remain visible when active in the source as-of cohort.
  users.find(user=>user.id===employee)!.isActive=false;
  const dashboard=computeTeamAnalytics({members:users,tasks:[],logs:[],period,calculation});
  const profile=await optionalEmployeePerformance(async()=>dashboard,employee),report=performanceReport(calculation,employee);
  expect(profile.performance!.calculation).toEqual(dashboard.members.find(m=>m.userId===employee)!.calculation);
  expect(report.members[0]).toEqual(profile.performance!.calculation);expect(report.context).toEqual(profile.performance!.calculationContext);
  expect(dashboard.members.find(m=>m.userId===employee)!.scaledProgress).toBe(3.6);
  expect(report.status).toBe('incomplete');
 });
 it('uses the exact approved live policy while sales prevents final certification',()=>{
  const result=resolvePerformance(sources());expect(result.status).toBe('incomplete');expect(result.context.attributionPolicy).toBe('normalized_shares');
  expect(result.context.windows.progress).toBe('period_earned');expect(result.context.factorDisplayPlaces).toBe(6);expect(result.context.displayPlaces).toBe(2);
  expect(result.members.find(m=>m.userId===employee)!.factors.progress.rawValue).toBe(3.6);
 });
 it('uses all six freshness states at the requested local date, with actual shared weights',()=>{
  const input=sources(),reference=new Date(input.asOfLocalDate+'T12:00:00Z');
  const date=(days:number)=>{const d=new Date(reference);d.setUTCDate(d.getUTCDate()-days);return d.toISOString().slice(0,10);};
  for(const [age,late,expected] of [[3,8,1.5],[4,0,1],[8,2,.5],[8,4,-.5],[10,7,-1],[12,8,-1.5]]){
    const clone=structuredClone(input),t=clone.tasks.find(t=>t.id==='10000000-0000-0000-0000-000000000001')!;t.assignedDate=date(age);t.dueDate=date(late);
    expect(resolvePerformance(clone,policy).members.find(m=>m.userId===employee)!.factors.freshness.rawValue).toBe(expected);
  }
 });
 it('uses captured completion shares while current criticality shares may change, and guards missing completion evidence',()=>{
  const input=sources(),t=input.tasks.find(t=>t.id==='10000000-0000-0000-0000-000000000001')!;
  t.status='Done';t.progress='100';t.completedDate=input.asOfLocalDate;t.completionShares={[employee]:500000,[other]:500000};t.shares={[employee]:700000,[other]:300000};
  const a=resolvePerformance(input,policy).members.find(m=>m.userId===employee)!;expect(a.factors.completion.rawValue).toBe(.5);expect(a.factors.criticality.rawValue).toBe(.7);expect(a.factors.progress.rawValue).toBe(3.6);
  t.completedDate=null;const incomplete=resolvePerformance(input,policy).members.find(m=>m.userId===employee)!;expect(incomplete.factors.completion.rawValue).toBeNull();expect(incomplete.factors.freshness.rawValue).toBeNull();
 });
 it('retains former assignee earnings without reallocating current or inactive shares',()=>{
  const input=sources(),t=input.tasks.find(t=>t.id==='10000000-0000-0000-0000-000000000001')!;
  t.participants=[other];t.shares={[other]:1000000};
  const result=resolvePerformance(input),a=result.members.find(m=>m.userId===employee)!;
  expect(a.factors.progress.rawValue).toBe(3.6);expect(a.factors.loading.rawValue).toBe(0);expect(a.factors.criticality.rawValue).toBe(0);
  t.participants=[employee,other];t.shares={[employee]:500000,[other]:500000};input.members.find(m=>m.id===other)!.active=false;
  const active=resolvePerformance(input);expect(active.members.some(m=>m.userId===other)).toBe(false);expect(active.members.find(m=>m.userId===employee)!.factors.loading.rawValue).toBe(.5);
 });
 it('counts late current Done completion, preserves measured zero and excludes only the missing factor',()=>{
  const input=sources(),t=input.tasks.find(t=>t.id==='10000000-0000-0000-0000-000000000001')!;
  t.status='Done';t.progress='100';t.completedDate=input.asOfLocalDate;t.dueDate=input.periodStart;t.completionShares={[employee]:500000,[other]:500000};
  input.attendance.find(a=>a.userId===employee)!.hours='0';
  const result=resolvePerformance(input),a=result.members.find(m=>m.userId===employee)!;
  expect(a.factors.completion.rawValue).toBe(.5);expect(a.factors.productivity.rawValue).toBeNull();expect(a.factors.productivity.population).not.toContain(employee);
  expect(a.factors.completion.population).toContain(employee);expect(a.factors.completion.population.length).toBeGreaterThan(2);
 });
 it('does not carry later-assigned tasks into an earlier report window when corrections have a newer as-of',()=>{
  const input=sources(),t=input.tasks.find(t=>t.id==='10000000-0000-0000-0000-000000000001')!;input.periodEndExclusive='2026-10-13';input.asOfLocalDate='2026-10-14';t.assignedDate='2026-10-14';
  const a=resolvePerformance(input).members.find(m=>m.userId===employee)!;expect(a.factors.criticality.rawValue).toBe(0);expect(a.factors.loading.rawValue).toBeNull();
 });
});
