import { describe, expect, it } from 'vitest';
import { compareRecordedHours, localCheckTime, dailyAttendanceValidity } from '@/lib/attendance/contract';
describe('M06 measured attendance inputs',()=>{
  it('compares 8h and 8.01h independently of the unresolved window policy',()=>{
    expect(compareRecordedHours('8','8').valid).toBe(true);
    expect(compareRecordedHours('8.01','8').valid).toBe(false);
  });
  it('distinguishes missing from measured zero',()=>{
    expect(compareRecordedHours('0',null)).toMatchObject({available:false,valid:null});
    expect(compareRecordedHours('0','0')).toMatchObject({available:true,valid:true});
    expect(compareRecordedHours('0.000001','0').valid).toBe(false);
  });
  it('preserves exact fractional hours',()=>{
    expect(compareRecordedHours('0.00027777777777777778','0.00027777777777777777').valid).toBe(false);
    expect(compareRecordedHours('0.3000000000','0.30').valid).toBe(true);
  });
  it('exposes bad source numbers',()=>{
    for(const bad of ['NaN','Infinity','-1','unknown'])expect(compareRecordedHours(bad,'8')).toMatchObject({available:false,valid:null});
  });
  it('interprets local clock values explicitly in Asia/Kolkata',()=>{
    expect(localCheckTime('2026-10-12','00:15')).toBe('2026-10-11T18:45:00.000Z');
    expect(localCheckTime('2026-10-12','09:00')).toBe('2026-10-12T03:30:00.000Z');
    expect(()=>localCheckTime('2026-10-12','25:00')).toThrow();
  });
  it('counts off-hours once and separates missing from known zero',()=>{
    expect(dailyAttendanceValidity('Present','8','2','10')).toMatchObject({available:true,valid:true});
    expect(dailyAttendanceValidity('Present','8','2','10.01')).toMatchObject({available:true,valid:false});
    expect(dailyAttendanceValidity(null,null,null,'0')).toMatchObject({available:false,valid:null});
    expect(dailyAttendanceValidity('Absent','0','0','0')).toMatchObject({available:true,valid:true});
  });
  it('applies all six approved states without assumed hours',()=>{
    for(const state of ['Present','Half Day'] as const)expect(dailyAttendanceValidity(state,'3.25','0','3.25').valid).toBe(true);
    for(const state of ['Absent','Leave'] as const){
      expect(dailyAttendanceValidity(state,'0','0','0.01').valid).toBe(false);
      expect(dailyAttendanceValidity(state,'0','1','0').reasons).toEqual(['attendance_state_hours_incompatible']);
    }
    for(const state of ['Holiday','Off Hours'] as const){
      expect(dailyAttendanceValidity(state,'0','2','2').valid).toBe(true);
      expect(dailyAttendanceValidity(state,'1','2','0').reasons).toEqual(['attendance_state_hours_incompatible']);
    }
    expect(dailyAttendanceValidity('Present','20','8','1')).toMatchObject({available:false,valid:null});
  });
});
