'use server';

import { loadChecklistRollups } from '@/modules/checklists';

import { initializeTaskDetails,saveTaskDetails,addTaskAsset,renameNativeLink } from '@/modules/tasks/detail-actions';

import { revalidatePath } from 'next/cache';
import type { PostgrestError } from '@supabase/supabase-js';

import { createTask, updateTask, updateTaskStatus } from '@/modules/tasks/actions';
import { createTaskLog, type LogActionState } from '@/modules/time-tracking/actions';

import { freezeMonthlySnapshot } from '@/app/dashboard/actions';
import { getTeamAnalytics } from '@/lib/analytics/queries';
import { performanceReport } from '@/modules/scoring/client';
import { createClient } from '@/shared/supabase/server';
import { isTaskStatus } from '@/shared/tracker/enums';
import { readString, UUID_PATTERN } from '@/shared/forms/form-data';
import { resolveActor } from '@/shared/session/actor';
import { type AnalyticsPeriod, currentPeriod } from '@/shared/time/period';
import type { ActionResponse } from '@/types/tracker';

export type TaskToolsActionState = ActionResponse<{
  id?: string;
  taskId?: string;
  taskTag?: string;
  reportId?: string;
}>;

export async function createTaskFromTools(
  formData: FormData,
): Promise<TaskToolsActionState> {
  return createTask(null, formData);
}

export async function updateTaskFromTools(
  formData: FormData,
): Promise<TaskToolsActionState> {
  return updateTask(null, formData);
}

export async function createTaskLogFromTools(
  formData: FormData,
): Promise<LogActionState> {
  return createTaskLog(null, formData);
}

export async function updateTaskStatusFromTools(formData: FormData): Promise<TaskToolsActionState> {
  const taskId=readString(formData,'taskId'),version=readString(formData,'expectedVersion');
  const status=readString(formData,'status');
  if (!UUID_PATTERN.test(taskId ?? '') || !isTaskStatus(status) || !/^\d+$/.test(version ?? '')) return {success:false,error:'Select a task and valid status.'};
  return updateTaskStatus(taskId,status,Number(version),readString(formData,'operationId'),readString(formData,'reason'));
}

/** Legacy callers cannot bypass review of a durable preview. */
export async function refreshTaskMetricsAction(form:FormData):Promise<TaskToolsActionState> {
  return {success:false,error:'Use Preview and commit in Task operations to refresh this task.'};
}
export async function duplicateTaskAction(form:FormData):Promise<TaskToolsActionState> {
  return {success:false,error:'Use Task operations to review an atomic duplication preview.'};
}
export async function createSupportTaskAction(form:FormData):Promise<TaskToolsActionState> {
  return {success:false,error:'Use Task operations to preview the support relationship and scale.'};
}
export async function createSplitSupportTaskAction(form:FormData):Promise<TaskToolsActionState> {
  return {success:false,error:'Use Task operations to preview and commit the complete support split.'};
}

export async function updateTaskDetailsAction(form:FormData){return saveTaskDetails(form);}
export async function createTaskDetailsWithFolderAction(form:FormData){return initializeTaskDetails(form);}
export async function createWorkFileLinkAction(form:FormData){return addTaskAsset(form);}
export async function renameTaskFolderLinkAction(form:FormData){return renameNativeLink(form);}

export async function generateReportFromToolsAction(
  formData: FormData,
): Promise<TaskToolsActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return { success: false, error: actor.error };
  if (actor.profile.role !== 'managing_director') {
    return { success: false, error: 'Only the managing director can create report snapshots.' };
  }

  const period = readPeriod(formData);
  const analytics = await getTeamAnalytics(period);
  const title = readString(formData, 'title') || `${period.label} Task Report`;
  const reportType = readString(formData, 'reportType') || 'Task Tools Report';
  const employeeId = readUuid(formData, 'employeeId');
  const targetMember = employeeId
    ? analytics.members.find((member) => member.userId === employeeId)
    : null;
  const supabase = await createClient();
  const {data:taskRows,error:taskError}=await supabase.from('tasks').select('id, assignee_id');
  if(taskError)return {success:false,error:taskError.message};
  let taskIds=taskRows.map(t=>t.id);
  if(employeeId) {
    const {data:assigned,error:assignmentError}=await supabase.from('task_assignees').select('task_id').eq('user_id',employeeId);
    if(assignmentError)return {success:false,error:assignmentError.message};
    const ids=new Set(assigned.map(a=>a.task_id));
    taskIds=taskRows.filter(t=>t.assignee_id===employeeId || ids.has(t.id)).map(t=>t.id);
  }
  const checklistObservations=await loadChecklistRollups(supabase,taskIds);
  const payload = {
    performanceRuleVersion:analytics.calculation?.context.ruleVersion??'m07-unavailable',
    calculationContext:analytics.calculation?.context??null,
    calculationStatus:analytics.calculation?.status??'incomplete',
    performance:analytics.calculation?performanceReport(analytics.calculation,employeeId):null,
    checklistContract:'m05-checklist-v1',
    checklistAsOf:new Date().toISOString(),
    currentChecklists:Object.fromEntries(checklistObservations),
    period,
    generatedBy: actor.profile.id,
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
      status: analytics.calculation?.status==='complete'?'Final':'Draft',
      calculation_rule_version:analytics.calculation?.context.ruleVersion??'m07-unavailable',
      period_start: period.startDate,
      period_end: period.endDate,
      employee_id: employeeId,
      payload: payload as never,
      created_by: actor.profile.id,
    })
    .select('id')
    .single();

  if (error) return { success: false, error: describeDatabaseError(error) };
  revalidatePath('/reports');
  revalidatePath('/team');
  return { success: true, data: { reportId: data.id } };
}

export async function freezeMonthlySnapshotFromTools(
  formData: FormData,
): Promise<ActionResponse<{ insertedCount: number }>> {
  const year = Number(readString(formData, 'year'));
  const month = Number(readString(formData, 'month'));
  const result = await freezeMonthlySnapshot(
    Number.isInteger(year) ? year : undefined,
    Number.isInteger(month) ? month : undefined,
  );

  if (!result.success) {
    return { success: false, error: result.error ?? 'Snapshot failed.' };
  }
  return {
    success: true,
    data: { insertedCount: result.data?.memberCount ?? 0 },
  };
}

function readUuid(formData: FormData, key: string): string | null {
  const value = readString(formData, key);
  return UUID_PATTERN.test(value) ? value : null;
}

function readPeriod(formData: FormData): AnalyticsPeriod {
  const year = Number(readString(formData, 'year'));
  const month = Number(readString(formData, 'month'));
  if (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    year >= 2026 &&
    month >= 1 &&
    month <= 12
  ) {
    return {
      ...currentPeriod(new Date(Date.UTC(year, month - 1, 1))),
      year,
      month,
    };
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

