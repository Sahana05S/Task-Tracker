'use server';

import { initializeTaskDetails,saveTaskDetails,addTaskAsset,renameNativeLink } from '@/modules/tasks/detail-actions';

import { createTask, updateTask, updateTaskStatus } from '@/modules/tasks/actions';
import { createTaskLog, type LogActionState } from '@/modules/time-tracking/actions';

import { freezeMonthlySnapshot } from '@/modules/reports/month-actions';
import { generateReportSnapshotAction } from '@/modules/reports/report-actions';
import { isTaskStatus } from '@/shared/tracker/enums';
import { readString, UUID_PATTERN } from '@/shared/forms/form-data';
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
  return generateReportSnapshotAction(formData);
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
