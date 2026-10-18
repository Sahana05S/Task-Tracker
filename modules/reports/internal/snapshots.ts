import type { PostgrestError } from '@supabase/supabase-js';

import { loadChecklistRollups } from '@/modules/checklists';
import { getTeamAnalytics } from '@/modules/reports/internal/team-analytics';
import { performanceReport } from '@/modules/scoring/client';
import { readString, UUID_PATTERN } from '@/shared/forms/form-data';
import { createClient } from '@/shared/supabase/server';
import { currentPeriod, type AnalyticsPeriod } from '@/shared/time/period';

/** Report snapshots: a dated, retained copy of the team or one employee's report. PRIVATE. */

type Result = { ok: true; reportId: string } | { ok: false; error: string };

function readUuid(formData: FormData, key: string): string | null {
  const value = readString(formData, key);
  return UUID_PATTERN.test(value) ? value : null;
}

/** The submitted month (2026 onwards), or the current month. */
function readPeriod(formData: FormData): AnalyticsPeriod {
  const year = Number(readString(formData, 'year'));
  const month = Number(readString(formData, 'month'));
  if (Number.isInteger(year) && Number.isInteger(month) && year >= 2026 && month >= 1 && month <= 12) {
    return { ...currentPeriod(new Date(Date.UTC(year, month - 1, 1))), year, month };
  }
  return currentPeriod();
}

function describeDatabaseError(error: PostgrestError): string {
  if (error.code === '42501') return 'You do not have permission for that workflow.';
  if (error.code === '23505') return 'That record already exists.';
  if (error.code === '23503') return 'A linked task or employee no longer exists.';
  if (error.code === '23514') return 'A submitted value is outside its permitted range.';
  return error.message;
}

/** The tasks in the report: all tasks, or those an employee is assigned to. */
async function reportTaskIds(supabase: Awaited<ReturnType<typeof createClient>>, employeeId: string | null) {
  const { data: taskRows, error: taskError } = await supabase.from('tasks').select('id, assignee_id');
  if (taskError) return { ok: false as const, error: taskError.message };
  if (!employeeId) return { ok: true as const, ids: taskRows.map((t) => t.id) };

  const { data: assigned, error: assignmentError } = await supabase.from('task_assignees').select('task_id').eq('user_id', employeeId);
  if (assignmentError) return { ok: false as const, error: assignmentError.message };
  const ids = new Set(assigned.map((a) => a.task_id));
  return { ok: true as const, ids: taskRows.filter((t) => t.assignee_id === employeeId || ids.has(t.id)).map((t) => t.id) };
}

/** Builds the snapshot payload from live analytics and checklist rollups, then stores it. */
export async function createReportSnapshot(formData: FormData, generatedBy: string): Promise<Result> {
  const period = readPeriod(formData);
  const analytics = await getTeamAnalytics(period);
  const title = readString(formData, 'title') || `${period.label} Task Report`;
  const reportType = readString(formData, 'reportType') || 'Task Tools Report';
  const employeeId = readUuid(formData, 'employeeId');
  const targetMember = employeeId ? analytics.members.find((member) => member.userId === employeeId) : null;

  const supabase = await createClient();
  const tasks = await reportTaskIds(supabase, employeeId);
  if (!tasks.ok) return { ok: false, error: tasks.error };
  const checklistObservations = await loadChecklistRollups(supabase, tasks.ids);

  const ruleVersion = analytics.calculation?.context.ruleVersion ?? 'm07-unavailable';
  const payload = {
    performanceRuleVersion: ruleVersion,
    calculationContext: analytics.calculation?.context ?? null,
    calculationStatus: analytics.calculation?.status ?? 'incomplete',
    performance: analytics.calculation ? performanceReport(analytics.calculation, employeeId) : null,
    checklistContract: 'm05-checklist-v1',
    checklistAsOf: new Date().toISOString(),
    currentChecklists: Object.fromEntries(checklistObservations),
    period,
    generatedBy,
    reportKind: targetMember ? 'employee' : 'general',
    summary: targetMember
      ? {
          employee: targetMember.fullName,
          starScore: targetMember.starScore,
          hoursLogged: targetMember.hoursLogged,
          scaledProgress: targetMember.scaledProgress,
          taskCount: targetMember.taskCount,
        }
      : {
          averageProductivity: analytics.totals.averageProductivity,
          hoursLogged: analytics.totals.hoursLogged,
          scaledProgress: analytics.totals.scaledProgress,
          activeMemberCount: analytics.totals.activeMemberCount,
          starPerformer: analytics.starPerformer?.fullName ?? null,
        },
  };

  const { data, error } = await supabase
    .from('report_snapshots')
    .insert({
      report_type: reportType,
      title,
      status: analytics.calculation?.status === 'complete' ? 'Final' : 'Draft',
      calculation_rule_version: ruleVersion,
      period_start: period.startDate,
      period_end: period.endDate,
      employee_id: employeeId,
      payload: payload as never,
      created_by: generatedBy,
    })
    .select('id')
    .single();

  if (error) return { ok: false, error: describeDatabaseError(error) };
  return { ok: true, reportId: data.id };
}
