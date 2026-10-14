import { canManageTasks } from '@/lib/tasks/permissions';
import type { UserRole } from '@/types/tracker';

export type WorkbookWorkflowId =
  | 'task-timer'
  | 'task-log'
  | 'task-status-update'
  | 'task-duplication'
  | 'task-details-update'
  | 'support-task-creation'
  | 'task-import-create'
  | 'master-checklist-updates'
  | 'refresh-metrics'
  | 'create-work-files'
  | 'report-generation';

export interface WorkbookWorkflow {
  readonly id: WorkbookWorkflowId;
  readonly label: string;
  readonly managerOnly: boolean;
  readonly status:string;
}

export const WORKBOOK_WORKFLOWS: readonly WorkbookWorkflow[] = [
  { id: 'task-timer', status: 'Native timer; source handler missing', label: 'Task timer', managerOnly: false },
  { id: 'task-log', status: 'Native retained logs; source handler missing', label: 'Task log', managerOnly: false },
  {
    id: 'task-status-update', status: 'Native gated lifecycle; source handler missing',
    label: 'Task status update',
    managerOnly: false,
  },
  { id: 'task-duplication', status: 'Native preview and atomic copies / batches', label: 'Task duplication', managerOnly: true },
  {
    id: 'task-details-update', status: 'Native details available; Drive integration deferred',
    label: 'Task details update',
    managerOnly: true,
  },
  {
    id: 'support-task-creation', status: 'Native atomic support; all8 approved variants',
    label: 'Support task creation',
    managerOnly: true,
  },
  {
    id: 'task-import-create', status: 'Native creation; historical import deferred by user',
    label: 'Task creation / import status',
    managerOnly: true,
  },
  {
    id: 'master-checklist-updates', status: 'Native M05 gates; source handlers missing',
    label: 'Master checklist updates',
    managerOnly: false,
  },
  { id: 'refresh-metrics', status: 'Shared recomputation; external attendance unavailable', label: 'Refresh metrics', managerOnly: false },
  { id: 'create-work-files', status: 'Manual asset links available; automatic Drive operations unavailable', label: 'Asset links / provider status', managerOnly: true },
  { id: 'report-generation', status: 'Native reports; missing inputs block certification', label: 'Report generation', managerOnly: true },
] as const;

export function canUseWorkbookWorkflow(
  role: UserRole,
  workflow: Pick<WorkbookWorkflow, 'managerOnly'>,
): boolean {
  return !workflow.managerOnly || canManageTasks(role);
}
