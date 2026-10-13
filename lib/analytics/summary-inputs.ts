import { createClient } from '@/lib/supabase/server';
import { cache } from 'react';
import { EMPTY_ATTENDANCE_SUMMARY, summarizeAttendance, type AttendanceSummary } from '@/lib/attendance/summary';
import { ATTENDANCE_STATUSES } from '@/lib/tracker/enums';
import type { AttendanceStatus } from '@/types/tracker';
import type { Json } from '@/types/database';
import { resolvePeriod, type AnalyticsPeriod } from '@/lib/analytics/engine';

type ObjectValue = { [key: string]: Json | undefined };
function object(value: Json | undefined): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid team summary response.');
  return value;
}
function rows(value: Json | undefined): ObjectValue[] {
  if (!Array.isArray(value)) throw new Error('Missing team summary inputs.');
  return value.map(object);
}
function text(value: Json | undefined): string {
  if (typeof value !== 'string') throw new Error('Invalid summary identity.');
  return value;
}
function number(value: Json | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid summary number.');
  return value;
}

export function parseTeamSummary(value: Json, period: AnalyticsPeriod) {
  const result = object(value);
  const logs = rows(result.logs).map((row) => {
    const creditShares = row.credit_shares === undefined || row.credit_shares === null ? undefined
      : Object.fromEntries(Object.entries(object(row.credit_shares)).map(([id, units]) => [id, number(units)]));
    if (creditShares && (Object.values(creditShares).some(units=>!Number.isInteger(units)||units<0||units>1_000_000) ||
      Object.values(creditShares).reduce((total,units)=>total+units,0)!==1_000_000)) throw new Error('Invalid earned-credit shares.');
    return ({
    userId: text(row.user_id), taskId: text(row.task_id), hoursWorked: number(row.hours_worked),
    progressDelta: row.progress_delta === null ? null : number(row.progress_delta),
    // This is the aggregate's month boundary, never an individual work date.
    logDate: period.startDate,
    creditShares,
    effectUnknown: row.effect_unknown === true || undefined,
    creditScale: row.credit_scale === undefined || row.credit_scale === null ? undefined : number(row.credit_scale),
  }); });
  const attendanceSummaries = new Map<string, AttendanceSummary>();
  for (const row of rows(result.attendance)) {
    const id = text(row.user_id); const status = text(row.status);
    if (!(ATTENDANCE_STATUSES as readonly string[]).includes(status)) throw new Error('Invalid attendance summary status.');
    const count = number(row.record_count);
    if (!Number.isInteger(count) || count < 0 || count > 31) throw new Error('Invalid attendance count.');
    const unit = summarizeAttendance([{ status: status as AttendanceStatus, attendanceHours: 0, offHours: 0 }]);
    const summary = { ...(attendanceSummaries.get(id) ?? EMPTY_ATTENDANCE_SUMMARY) };
    for (const key of Object.keys(unit) as (keyof AttendanceSummary)[]) summary[key] += unit[key] * count;
    summary.attendanceHours += number(row.attendance_hours);
    summary.offHours += number(row.off_hours);
    attendanceSummaries.set(id, summary);
  }
  const reportCounts = new Map<string, number>();
  for (const row of rows(result.report_counts)) {
    if (row.employee_id !== null) reportCounts.set(text(row.employee_id), number(row.report_count));
  }
  const report = object(result.report_summary);
  const reportSummary = {
    total: number(report.total), final: number(report.final), draft: number(report.draft),
    employeeReports: number(report.employeeReports), generalReports: number(report.generalReports),
  };
  return { logs, attendanceSummaries, reportCounts, reportSummary };
}

const readMonthlySummary = cache(async (year: number, month: number) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('team_summary_inputs', { p_year: year, p_month: month });
  if (error) throw new Error(`Failed to load team summary: ${error.message}`);
  return parseTeamSummary(data, resolvePeriod(year,month));
});
export async function getTeamSummaryInputs(period: AnalyticsPeriod) {
  const canonical = resolvePeriod(period.year,period.month);
  if (period.startDate!==canonical.startDate || period.endDate!==canonical.endDate) throw new Error('Team summaries require a complete calendar month.');
  return readMonthlySummary(period.year,period.month);
}
