'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { DEFAULT_WAYPOINTS, freshCelebrations, type Waypoint, type WaypointCrossing } from '@/modules/recognition/client';

import { ConfettiBurst } from './confetti-burst';

export interface CelebratedTask {
  taskId: string;
  taskTag: string;
  crossings: readonly WaypointCrossing[];
}

/**
 * Celebrates a waypoint for the person whose save crossed it, within 15
 * minutes of the save: a toast ("Ignition! Sep26_T5 passed 30%") and a short
 * confetti fall. Each waypoint of each mission fires once per browser
 * (localStorage `tp.waypoint.<task>.<key>`); a save that crosses several shows
 * the furthest one. Other assignees are credited but not celebrated. No points.
 * Renders nothing else; the track states the same fact in text.
 */
export function WaypointCelebration({ tasks, waypoints = DEFAULT_WAYPOINTS }: { tasks: readonly CelebratedTask[]; waypoints?: readonly Waypoint[] }) {
  const [burst, setBurst] = useState<string | null>(null);

  useEffect(() => {
    // The clock is read here, after hydration, so server and client agree.
    const celebrated = new Set<string>();
    let latest: string | null = null;
    for (const item of freshCelebrations(tasks, Date.now(), waypoints)) {
      const key = `tp.waypoint.${item.taskId}.${item.key}`;
      try {
        if (window.localStorage.getItem(key)) continue;
        window.localStorage.setItem(key, '1');
      } catch {
        continue;
      }
      // Items come furthest first: one toast per mission, the rest are marked seen.
      if (celebrated.has(item.taskId)) continue;
      celebrated.add(item.taskId);
      toast(`${item.label}!`, {
        description: `${item.taskTag} ${item.percent >= 100 ? 'reached' : 'passed'} ${item.percent}%.`,
        icon: <span aria-hidden="true">✦</span>,
        duration: 6000,
      });
      latest ??= `${item.taskId}.${item.key}`;
    }
    if (latest) setBurst(latest);
  }, [tasks, waypoints]);

  if (!burst) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-50">
      <ConfettiBurst id={`waypoint.${burst}`} />
    </div>
  );
}
