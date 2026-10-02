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
}

export const WORKBOOK_WORKFLOWS: readonly WorkbookWorkflow[] = [
  { id: 'task-timer', label: 'Task timer', managerOnly: false },
  { id: 'task-log', label: 'Task log', managerOnly: false },
  {
    id: 'task-status-update',
    label: 'Task status update',
    managerOnly: false,
  },
  { id: 'task-duplication', label: 'Task duplication', managerOnly: true },
  {
    id: 'task-details-update',
    label: 'Task details update',
    managerOnly: true,
  },
  {
    id: 'support-task-creation',
    label: 'Support task creation',
    managerOnly: true,
  },
  {
    id: 'task-import-create',
    label: 'Task import/create flow',
    managerOnly: true,
  },
  {
    id: 'master-checklist-updates',
    label: 'Master checklist updates',
    managerOnly: false,
  },
  { id: 'refresh-metrics', label: 'Refresh metrics', managerOnly: false },
  { id: 'create-work-files', label: 'Create work files', managerOnly: true },
  { id: 'report-generation', label: 'Report generation', managerOnly: true },
] as const;

export function canUseWorkbookWorkflow(
  role: UserRole,
  workflow: Pick<WorkbookWorkflow, 'managerOnly'>,
): boolean {
  return !workflow.managerOnly || canManageTasks(role);
}
