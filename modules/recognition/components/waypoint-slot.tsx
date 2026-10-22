'use client';

import { createContext, useContext, type ReactNode } from 'react';

import type { MissionWaypoints } from '@/modules/recognition/client';

import { WaypointCelebration } from './waypoint-celebration';
import { WaypointTrack, type WaypointTrackVariant } from './waypoint-track';

const WaypointContext = createContext<MissionWaypoints | null>(null);

/**
 * Supplies the Missions list's waypoints (`getMissionWaypoints`) to the
 * `WaypointSlot` the tasks module leaves on cards and table rows, and celebrates the viewer's fresh crossings. Null (a failed
 * read) still renders tracks from current progress, without celebrations.
 */
export function WaypointProvider({ value, children }: { value: MissionWaypoints | null; children: ReactNode }) {
  return (
    <WaypointContext.Provider value={value}>
      {children}
      {value?.recent.length ? <WaypointCelebration tasks={value.recent} waypoints={value.waypoints} /> : null}
    </WaypointContext.Provider>
  );
}

/** One mission's track inside a `WaypointProvider` (cards: compact; table: cell). */
export function MissionWaypointSlot({
  taskId,
  taskTag,
  progress,
  stopped,
  variant,
}: {
  taskId: string;
  taskTag: string;
  progress: number | null;
  stopped: boolean;
  variant: Extract<WaypointTrackVariant, 'compact' | 'cell'>;
}) {
  const model = useContext(WaypointContext);
  return (
    <WaypointTrack
      progress={progress}
      reachedKeys={model?.reached[taskId]}
      waypoints={model?.waypoints}
      taskTag={taskTag}
      variant={variant}
      stopped={stopped}
    />
  );
}
