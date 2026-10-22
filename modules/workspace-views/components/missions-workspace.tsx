'use client';

import type { MissionWaypoints } from '@/modules/recognition/client';
import { MissionWaypointSlot, WaypointProvider } from '@/modules/recognition/components/waypoint-slot';
import { TaskWorkspace, type TaskWorkspaceProps } from '@/modules/tasks/components/task-workspace';
import { TimerButton } from '@/modules/time-tracking/components/timer-button';

/**
 * The Missions list with time tracking and recognition plugged in. The tasks
 * module leaves slots so it depends on neither; this page-level client
 * component fills them with the timer button and the waypoint track. Manual
 * entry ("Log time") lives in the top bar, the phone "New" menu and the
 * mission page, not on cards.
 */
export function MissionsWorkspace({
  waypoints,
  ...props
}: Omit<TaskWorkspaceProps, 'LogHoursAction' | 'WaypointSlot'> & {
  /** Reached waypoints and the viewer's recent crossings; null when the read failed (tracks then follow current progress). */
  waypoints: MissionWaypoints | null;
}) {
  return (
    <WaypointProvider value={waypoints}>
      <TaskWorkspace {...props} LogHoursAction={CardTimerButton} WaypointSlot={MissionWaypointSlot} />
    </WaypointProvider>
  );
}

/** Names the mission in each card's button ("Start timer on TT-12"), since a list shows many. */
function CardTimerButton({ taskId, taskTag }: { taskId: string; taskTag: string }) {
  return <TimerButton taskId={taskId} taskLabel={taskTag} />;
}
