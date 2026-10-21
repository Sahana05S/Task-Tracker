// PRIVATE pure waypoint rules. No I/O, no dates from the clock.
import { DEFAULT_WAYPOINTS, type Waypoint } from './rules';

/** A stored first crossing, as returned by `recognition_task_waypoints`. */
export interface WaypointCrossing {
  key: string;
  percent: number;
  reachedAt: string;
  source: 'progress' | 'insert' | 'backfill';
  /** The viewer's own save crossed it. */
  mine: boolean;
}

export interface WaypointState {
  /** Waypoints reached, lowest first. */
  reached: Waypoint[];
  /** The lowest waypoint not reached yet; null once every waypoint is. */
  next: Waypoint | null;
}

/**
 * Reached = every stored crossing plus every waypoint the current progress
 * covers. Stored crossings are never undone, so a mission whose progress drops
 * keeps the waypoints it passed; current progress covers databases before 51
 * (no stored crossings) and the moment before a save is read back.
 */
export function waypointState(
  progress: number | null,
  storedKeys: readonly string[] = [],
  waypoints: readonly Waypoint[] = DEFAULT_WAYPOINTS,
): WaypointState {
  const isReached = (w: Waypoint) => storedKeys.includes(w.key) || (progress !== null && progress >= w.percent);
  return { reached: waypoints.filter(isReached), next: waypoints.find((w) => !isReached(w)) ?? null };
}

/** What a page ships to the browser: reached keys for the tracks, and the viewer's own recent crossings to celebrate. */
export interface MissionWaypoints {
  waypoints: readonly Waypoint[];
  reached: Record<string, string[]>;
  /** The viewer's own crossings from the last day (the client applies the 15-minute window). */
  recent: { taskId: string; taskTag: string; crossings: WaypointCrossing[] }[];
}

const RECENT_MS = 24 * 60 * 60 * 1000;

/** Trims stored crossings to what a page ships to the browser. */
export function missionWaypoints(
  model: { waypoints: readonly Waypoint[]; crossings: Readonly<Record<string, readonly WaypointCrossing[]>> },
  tasks: readonly { id: string; taskTag: string }[],
  now: number,
): MissionWaypoints {
  const reached: Record<string, string[]> = {};
  const recent: MissionWaypoints['recent'] = [];
  for (const task of tasks) {
    const crossings = model.crossings[task.id];
    if (!crossings?.length) continue;
    reached[task.id] = crossings.map((c) => c.key);
    const mine = crossings.filter((c) => c.mine && now - Date.parse(c.reachedAt) <= RECENT_MS);
    if (mine.length) recent.push({ taskId: task.id, taskTag: task.taskTag, crossings: mine });
  }
  return { waypoints: model.waypoints, reached, recent };
}

/** How long after a save its waypoint is still celebrated. */
export const CELEBRATION_WINDOW_MS = 15 * 60 * 1000;

export interface WaypointCelebrationItem {
  taskId: string;
  taskTag: string;
  key: string;
  label: string;
  percent: number;
  reachedAt: string;
}

/**
 * Crossings to celebrate: the viewer's own save, within the window, never a
 * backfill. Highest waypoint first, so one save that passes several shows the
 * furthest one on top.
 */
export function freshCelebrations(
  tasks: readonly { taskId: string; taskTag: string; crossings: readonly WaypointCrossing[] }[],
  now: number,
  waypoints: readonly Waypoint[] = DEFAULT_WAYPOINTS,
): WaypointCelebrationItem[] {
  const labels = new Map(waypoints.map((w) => [w.key, w.label]));
  const items: WaypointCelebrationItem[] = [];
  for (const task of tasks) {
    for (const c of task.crossings) {
      const at = Date.parse(c.reachedAt);
      // A stamp ahead of the device clock (a slow phone) is still fresh.
      if (!c.mine || c.source === 'backfill' || !Number.isFinite(at) || now - at > CELEBRATION_WINDOW_MS) continue;
      items.push({ taskId: task.taskId, taskTag: task.taskTag, key: c.key, label: labels.get(c.key) ?? c.key, percent: c.percent, reachedAt: c.reachedAt });
    }
  }
  return items.sort((a, b) => b.percent - a.percent || a.taskTag.localeCompare(b.taskTag));
}
