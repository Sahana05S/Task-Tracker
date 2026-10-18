'use client';

import { TaskWorkspace, type TaskWorkspaceProps } from '@/modules/tasks/components/task-workspace';
import { QuickLogTrigger } from '@/modules/time-tracking/components/quick-log-trigger';

/** The "Log hours" button on each open mission card. */
function LogHoursButton({ taskId }: { taskId: string }) {
  return <QuickLogTrigger variant="button" label="Log hours" presetTaskId={taskId} />;
}

/**
 * The Missions list with time tracking plugged in. The tasks module leaves a
 * slot for the button so it does not depend on time-tracking; this page-level
 * client component fills it.
 */
export function MissionsWorkspace(props: Omit<TaskWorkspaceProps, 'LogHoursAction'>) {
  return <TaskWorkspace {...props} LogHoursAction={LogHoursButton} />;
}
