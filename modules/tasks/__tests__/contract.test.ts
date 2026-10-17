import {describe,it,expect} from 'vitest';
import {eligibilityReasons,PRIORITY_WEIGHTS,scaleValue} from '@/modules/tasks/internal/contract';
const task={priority:'Medium' as const,status:'In Progress' as const,taskScale:8,progressPercentage:15};
describe('independent M03 contract fixtures',()=>{
 it('has exact approved priority weights',()=>expect(PRIORITY_WEIGHTS).toEqual({No:0.25,Low:0.5,Medium:0.75,High:1,Focus:1.2}));
 it('accepts 15 without requiring hours',()=>expect(eligibilityReasons(task)).toEqual([]));
 it('excludes 14.99',()=>expect(eligibilityReasons({...task,progressPercentage:14.99})).toEqual(['progress_below_15']));
 it('returns every exclusion instead of one opaque flag',()=>expect(eligibilityReasons({...task,priority:'No',status:'Not Started',taskScale:0,progressPercentage:0})).toEqual(['priority_no','not_started','progress_below_15','scale_nonpositive']));
 it('keeps unknown scale distinct from measured zero',()=>expect(eligibilityReasons({...task,taskScale:null})).toEqual(['scale_missing']));
 it.each(['Stopped','On-Hold','Carryover'] as const)('uses source exclusions for %s',status=>expect(eligibilityReasons({...task,status})).toEqual([]));
 it('supports manual, activity-count, hours and linked formula families',()=>{
  expect(scaleValue('manual',{value:8})).toBe(8);
  expect(scaleValue('activity_count',{activity_count:3,unit_scale:2.5})).toBe(7.5);
  expect(scaleValue('hours',{multiplier:1.5},2)).toBe(37.5);
  expect(scaleValue('linked',{percentage:50},0,8)).toBe(4);
 });
 it('preserves explicit zero overrides and small intermediates',()=>{
  expect(scaleValue('hours',{multiplier:1.5},2,null,0)).toBe(0);
  expect(scaleValue('linked',{percentage:12.5},0,0.05)).toBe(0.00625);
 });
});
