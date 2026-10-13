import { describe,it,expect } from 'vitest';
import { Exact,exactMedian } from '@/lib/performance/exact';
import { calculatePerformance,FACTORS,measuredRaw,unavailableRaw,PERFORMANCE_RULE_VERSION,type CalculationContext,type MemberRawInputs,type Factor } from '@/lib/performance/engine';
import { taskProductivity } from '@/lib/performance/sources';
import { performanceForAward } from '@/lib/stars/scoring';
const context=(ids:string[]):CalculationContext=>({ruleVersion:PERFORMANCE_RULE_VERSION,periodStart:'2026-10-01',periodEndExclusive:'2026-11-01',asOf:'2026-10-12T12:00:00Z',asOfLocalDate:'2026-10-12',timezone:'Asia/Kolkata',attributionPolicy:'fixture-explicit',sourceWatermark:'fixture:1',precisionPolicy:'fixture-exact',displayPlaces:2,
 windows:Object.fromEntries(FACTORS.map(f=>[f,'fixture-explicit'])) as CalculationContext['windows'],cohorts:Object.fromEntries(FACTORS.map(f=>[f,{id:`fixture-${f}`,memberIds:ids,missingPolicy:'exclude_unavailable',includeObservedZero:true}])) as CalculationContext['cohorts']});
const member=(id:string,values:Partial<Record<Factor,string>>={}):MemberRawInputs=>({userId:id,eligibilityReasons:[],factors:Object.fromEntries(FACTORS.map(f=>[f,measuredRaw(values[f]??'0')])) as MemberRawInputs['factors']});

describe('M07 independent exact ten-factor fixtures',()=>{
 it('preserves odd/even medians and fractional even medians',()=>{
  expect(exactMedian(['1','3','8'].map(Exact.from))!.number()).toBe(3);
  expect(exactMedian(['1','3','8','10'].map(Exact.from))!.number()).toBe(5.5);
  expect(exactMedian(['1.001','1.004'].map(Exact.from))!.json()).toEqual({numerator:'401',denominator:'400'});
 });
 it('loading .30 minus median .25 contributes exactly2, without percent units',()=>{
  const result=calculatePerformance(context(['a','b','c']),[member('a',{loading:'.20'.replace(/^\./,'0.')}),member('b',{loading:'0.25'}),member('c',{loading:'0.30'})]);
  expect(result.members[2].factors.loading).toMatchObject({rawValue:.3,median:.25,delta:.05,contribution:2});
  expect(result.members[2].factors.loading.contributionExact).toEqual({numerator:'2',denominator:'1'});
 });
 it('separates task25pp/hour from employee .00625 scaled units/attendance hour',()=>{
  expect(Exact.from(taskProductivity('50','2').value!).number()).toBe(25);
  expect(Exact.from('0.05').div(Exact.from('8')).json()).toEqual({numerator:'1',denominator:'160'});
  expect(Exact.from('0.05').div(Exact.from('8')).number()).toBe(.00625);
 });
 it('uses the literal A09 delta vector and reconciles exact contributions to10.10',()=>{
  const target=member('target',{productivity:'2',criticality:'1',loading:'0.05',completion:'2',progress:'80',sales:'1',facts:'-0.4',ideas:'2',suggestions:'-1',freshness:'-1'});
  const result=calculatePerformance(context(['zero1','zero2','target']),[member('zero1'),member('zero2'),target]);
  const score=result.members[2];expect(score.compositeExact).toEqual({numerator:'101',denominator:'10'});expect(score.composite).toBe(10.1);
  expect(Exact.from(score.compositeExact!).display(2)).toBe('10.10');
  const sum=FACTORS.reduce((s,f)=>s.add(Exact.from(score.factors[f].contributionExact!)),Exact.from(0));expect(sum.json()).toEqual(score.compositeExact);
 });
 it('identical observed values give zero deltas for every factor',()=>{
  const result=calculatePerformance(context(['a','b']),[member('a'),member('b')]);expect(result.status).toBe('complete');
  for(const m of result.members){expect(m.composite).toBe(0);for(const f of FACTORS)expect(m.factors[f].delta).toBe(0);}
 });
 it('distinguishes observed zero from missing and records excluded population',()=>{
  const missing=member('b');missing.factors.productivity=unavailableRaw('attendance_missing');
  const result=calculatePerformance(context(['a','b']),[member('a'),missing]);
  expect(result.members[0].factors.productivity.median).toBe(0);
  expect(result.members[0].factors.productivity.excludedPopulation).toEqual([{userId:'b',reasons:['attendance_missing']}]);
  expect(result.members[1].factors.productivity.rawValue).toBeNull();expect(result.members[1].composite).toBeNull();
 });
 it('missing sales keeps nine measured factors and subtotal separate from final score',()=>{
  const a=member('a',{progress:'20'}),b=member('b'),c=member('c');for(const m of [a,b,c])m.factors.sales=unavailableRaw('sales_field_mapping_missing');
  const result=calculatePerformance(context(['a','b','c']),[a,b,c]);expect(result.status).toBe('incomplete');
  expect(result.members[0]).toMatchObject({composite:null,knownSubtotal:.25,eligibleForRanking:false,subtotalLabel:'Available-factor subtotal'});
  expect(result.members[0].factors.sales.contribution).toBeNull();expect(()=>performanceForAward(result.members[0])).toThrow('complete');
 });
 it('does not invent unapproved windows/cohorts/precision',()=>{
  const ctx=context(['a']);ctx.cohorts.progress=null;ctx.windows.progress=null;ctx.precisionPolicy=null;
  expect(calculatePerformance(ctx,[member('a')]).members[0].reasons).toEqual(expect.arrayContaining(['progress:factor_cohort_unapproved','progress:factor_window_unapproved','precision_policy_unapproved']));
 });
 it('rejects invalid numeric and percentage loading instead of fabricating zero',()=>{
  const a=member('a');a.factors.loading=measuredRaw('30');a.factors.facts=measuredRaw(NaN);
  const score=calculatePerformance(context(['a']),[a]).members[0];expect(score.factors.loading.rawValue).toBeNull();expect(score.factors.facts.rawValue).toBeNull();
 });
 it('respects distinct factor cohorts and a strict missing-source policy',()=>{
  const ctx=context(['a','b']);ctx.cohorts.facts!.memberIds=['a'];ctx.cohorts.productivity!.missingPolicy='strict';
  const b=member('b',{facts:'100'});b.factors.productivity=unavailableRaw('source_failed');
  const result=calculatePerformance(ctx,[member('a',{facts:'2'}),b]);expect(result.members[0].factors.facts.median).toBe(2);expect(result.members[0].factors.productivity.median).toBeNull();
 });
 it('keeps eligibility separate from a measured factor and denies award certification',()=>{
  const a=member('a');a.eligibilityReasons=['attendance_invalid'];const r=calculatePerformance(context(['a']),[a]).members[0];
  expect(r.factors.facts.rawValue).toBe(0);expect(r.eligibleForRanking).toBe(false);expect(()=>performanceForAward(r)).toThrow();
 });
 it('rounds only an explicitly requested output, preserving exact intermediates',()=>{
  const rate=Exact.from(1).div(Exact.from(3));expect(rate.display(2)).toBe('0.33');expect(rate.json()).toEqual({numerator:'1',denominator:'3'});
  expect(Exact.from('-1.005').display(2)).toBe('-1.01');
 });
});
