import { describe,expect,it } from 'vitest';
import { calculationReasons,dataGaps,plainReason } from '@/lib/presentation/plain-language';

describe('plain reason wording',()=>{
 it('translates known codes, including factor-prefixed ones',()=>{
  expect(plainReason('sales:sales_field_mapping_missing')).toBe("Sales data isn't connected yet");
  expect(plainReason('productivity:attendance_denominator_missing')).toBe('Attendance not recorded for some days');
  expect(plainReason('daily_coverage_incomplete')).toBe('Not every day has a decided daily star');
 });
 it('never hides an unknown code: it falls back to a generic sentence',()=>{
  expect(plainReason('something_new')).toBe('Required data not available');
  expect(dataGaps(['something_new'])).toEqual(['other']);
 });
 it('groups the root causes behind the dashboard codes',()=>{
  const codes=['shared_calculation_incomplete','attendance_unavailable','productivity:raw_input_unavailable',
   'loading:team_assigned_scale_zero','sales:sales_field_mapping_missing','sales:factor_median_unavailable'];
  expect(dataGaps(codes)).toEqual(['attendance','sales','other']);
  expect(dataGaps(['required_inputs_unavailable'])).toEqual([]);
 });
 it('collects codes from the calculation, members and factors',()=>{
  expect(calculationReasons({reasons:['a'],members:[{reasons:['b'],factors:{sales:{reasons:['c']}}}]})).toEqual(['a','b','c']);
  expect(calculationReasons(null)).toEqual([]);
 });
});
