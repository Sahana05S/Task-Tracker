import { describe,it,expect } from 'vitest';
import { APPROVED_TOOL_POLICY,supportAmounts,phaseDates,parsePreview } from '@/lib/task-tools/contract';

describe('M09 independent arithmetic and date fixtures',()=>{
 it('records exactly the approved defaults and import deferral',()=>expect(APPROVED_TOOL_POLICY).toMatchObject({id:'m09-approved-2026-10-13',unevenMaximum:'whole',batch:'atomic',archive:true,historicalImport:false}));
 it('transfers exactly half without losing fractional scale',()=>{
  const split=supportAmounts('10','split-even');
  expect(split.support.json()).toEqual({numerator:'5',denominator:'1'});
  expect(split.sourceAfter?.json()).toEqual({numerator:'5',denominator:'1'});
  expect(supportAmounts('0.05','split-even').support.json()).toEqual({numerator:'1',denominator:'40'});
 });
 it('compares both unresolved Uneven bounds explicitly',()=>{
  expect(supportAmounts('10','split-uneven','7',undefined,'whole').sourceAfter?.number()).toBe(3);
  expect(()=>supportAmounts('10','split-uneven','7',undefined,'half')).toThrow();
 });
 it('gives proportional 20% of 10 two units without reduction',()=>{
  const split=supportAmounts('10','proportional',undefined,'20');
  expect(split.support.number()).toBe(2);expect(split.sourceAfter).toBeNull();
 });
 it('absolute is independent of a missing source scale',()=>{
  const split=supportAmounts(null,'absolute','12.5');
  expect(split.support.number()).toBe(12.5);expect(split.sourceAfter).toBeNull();
 });
 it.each([
  ()=>supportAmounts(null,'split-even'),()=>supportAmounts('NaN','split-even'),
  ()=>supportAmounts('10','absolute','501'),()=>supportAmounts('10','absolute','-1'),
  ()=>supportAmounts('10','proportional',undefined,'100.01'),()=>supportAmounts('10','split-uneven'),
  ()=>supportAmounts('10','split-uneven','11',undefined,'whole'),
 ])('rejects unavailable or invalid measured inputs',f=>expect(f).toThrow());
 it('draft phases use inclusive calendar dates across a leap boundary',()=>{
  expect(phaseDates('2028-02-26',2,7)).toEqual([
   {assignedDate:'2028-02-26',dueDate:'2028-03-03'},
   {assignedDate:'2028-03-04',dueDate:'2028-03-10'},
  ]);
 });
 it.each([['2026-02-30',2,3],['2026-01-01',0,7],['2026-01-01',101,7],['2026-01-01',2,0],['2026-01-01',1.5,3]] as const)('rejects invalid dates/counts',(start,count,length)=>expect(()=>phaseDates(start,count,length)).toThrow());
 it('does not pretend a missing preview succeeded',()=>expect(()=>parsePreview(null)).toThrow());
});
