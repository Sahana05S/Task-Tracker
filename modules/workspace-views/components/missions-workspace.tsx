'use client';

import { TaskWorkspace, type TaskWorkspaceProps } from '@/modules/tasks/components/task-workspace';
import { TimerButton } from '@/modules/time-tracking/components/timer-button';

/**
 * The Missions list with time tracking plugged in. The tasks module leaves a
 * slot for the button so it does not depend on time-tracking; this page-level
 * client component fills it with the timer button. Manual entry ("Log time")
 * lives in the top bar, the phone "New" menu and the mission page, not on cards.
 */
export function MissionsWorkspace(props: Omit<TaskWorkspaceProps, 'LogHoursAction'>) {
  return <TaskWorkspace {...props} LogHoursAction={CardTimerButton} />;
}

/** Names the mission in each card's button ("Start timer on TT-12"), since a list shows many. */
function CardTimerButton({ taskId, taskTag }: { taskId: string; taskTag: string }) {
  return <TimerButton taskId={taskId} taskLabel={taskTag} />;
}
