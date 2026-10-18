import { describe, expect, it, vi } from 'vitest';
vi.mock('@/shared/supabase/server', () => ({createClient: vi.fn()}));
import { parseTeamSummary } from '@/modules/scoring/internal/analytics/summary-inputs';
import { resolvePeriod } from '@/modules/scoring/internal/analytics/engine';

describe('monthly aggregate input contract', () => {
  const value = {
    logs:[{user_id:'worker',task_id:'task',hours_worked:8,progress_delta:25}],
    attendance:[{user_id:'worker',status:'Half Day',record_count:2,attendance_hours:8,off_hours:0}],
    report_counts:[{employee_id:'worker',report_count:3}],
    report_summary:{total:4,final:2,draft:2,employeeReports:3,generalReports:1},
  };
  it('preserves sums and attendance counts without fabricating daily records', () => {
    const result=parseTeamSummary(value,resolvePeriod(2026,10));
    expect(result.logs).toEqual([{userId:'worker',taskId:'task',hoursWorked:8,progressDelta:25,logDate:'2026-10-01'}]);
    expect(result.attendanceSummaries.get('worker')).toMatchObject({recordCount:2,halfDays:2,payableDays:1,attendanceHours:8});
    expect(result.reportCounts.get('worker')).toBe(3);
    expect(result.reportSummary.total).toBe(4);
  });
  it('reports malformed or unavailable inputs as failures', () => {
    expect(() => parseTeamSummary({},resolvePeriod(2026,10))).toThrow('Missing');
    expect(() => parseTeamSummary({...value,attendance:[{...value.attendance[0],record_count:1.5}]},resolvePeriod(2026,10))).toThrow('count');
    expect(() => parseTeamSummary({...value,logs:[{...value.logs[0],hours_worked:'8'}]},resolvePeriod(2026,10))).toThrow('number');
  });
  it('M02 carries unavailable-progress metadata without hiding independent attendance/reports', () => {
    const summary=parseTeamSummary({...value,logs:[{...value.logs[0],progress_delta:null,effect_unknown:true}]},resolvePeriod(2026,10));
    expect(summary.logs[0]).toMatchObject({effectUnknown:true,progressDelta:null});
    expect(summary.reportSummary.total).toBe(4);
  });
  it('M02 preserves original credit metadata in month aggregates', () => {
    const summary=parseTeamSummary({...value,logs:[{...value.logs[0],credit_shares:{worker:500000,other:500000},credit_scale:8,effect_unknown:false}]},resolvePeriod(2026,10));
    expect(summary.logs[0]).toMatchObject({creditShares:{worker:500000,other:500000},creditScale:8,progressDelta:25});
  });

});
