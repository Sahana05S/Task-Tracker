// PRIVATE. Server-side waypoint reads (migration 51), with the pre-51 fallback.
import { isMissingFunctionError } from '@/shared/supabase/schema-errors';
import { createClient } from '@/shared/supabase/server';

import { parseWaypoints } from './policy';
import { DEFAULT_WAYPOINTS, type Waypoint } from './rules';
import { missionWaypoints, type MissionWaypoints, type WaypointCrossing } from './waypoint-rules';

/** The read accepts at most this many missions per call. */
const BATCH = 500;

export interface TaskWaypointsModel {
  waypoints: readonly Waypoint[];
  /** taskId to its stored first crossings, lowest first. */
  crossings: Record<string, WaypointCrossing[]>;
}

export interface WaypointCount {
  total: number;
  byKey: Record<string, number>;
}

/** No stored crossings: tracks follow current progress only (also a database before 51). */
const EMPTY: TaskWaypointsModel = { waypoints: DEFAULT_WAYPOINTS, crossings: {} };

function crossing(raw: unknown): WaypointCrossing | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const percent = Number(r.percent);
  if (typeof r.key !== 'string' || typeof r.reachedAt !== 'string' || !Number.isFinite(percent)) return null;
  const source = r.source === 'insert' || r.source === 'backfill' ? r.source : 'progress';
  return { key: r.key, percent, reachedAt: r.reachedAt, source, mine: r.mine === true };
}

/**
 * Stored waypoint crossings for missions of the caller's company. The
 * database omits missions of other companies; a database without migration 51
 * yields the defaults and no stored crossings.
 */
export async function getTaskWaypoints(taskIds: readonly string[]): Promise<TaskWaypointsModel> {
  const ids = [...new Set(taskIds)];
  if (ids.length === 0) return EMPTY;
  const db = await createClient();
  const batches = Array.from({ length: Math.ceil(ids.length / BATCH) }, (_, i) => ids.slice(i * BATCH, (i + 1) * BATCH));
  const results = await Promise.all(batches.map((batch) => db.rpc('recognition_task_waypoints', { p_task_ids: batch })));
  const crossings: Record<string, WaypointCrossing[]> = {};
  let waypoints: readonly Waypoint[] = DEFAULT_WAYPOINTS;
  for (const { data, error } of results) {
    if (error) {
      if (isMissingFunctionError(error)) return EMPTY;
      throw new Error(`Waypoints read failed: ${error.message}`);
    }
    const model = (data ?? {}) as { waypoints?: unknown; tasks?: unknown };
    waypoints = parseWaypoints(model.waypoints);
    for (const task of Array.isArray(model.tasks) ? model.tasks : []) {
      const t = task as { taskId?: unknown; reached?: unknown };
      if (typeof t.taskId !== 'string') continue;
      crossings[t.taskId] = (Array.isArray(t.reached) ? t.reached : []).map(crossing).filter((c): c is WaypointCrossing => c !== null);
    }
  }
  return { waypoints, crossings };
}

/**
 * The page-sized form of `getTaskWaypoints`: reached keys per mission and the
 * viewer's own recent crossings, for the tracks and the celebration.
 */
export async function getMissionWaypoints(tasks: readonly { id: string; taskTag: string }[]): Promise<MissionWaypoints> {
  return missionWaypoints(await getTaskWaypoints(tasks.map((task) => task.id)), tasks, Date.now());
}

/**
 * Waypoints reached by one member between two Asia/Kolkata dates (inclusive),
 * crediting every current assignee; backfilled crossings never count. Null on
 * a database without migration 51. The database refuses another member's
 * count unless the caller is a manager.
 */
export async function getWaypointCount(userId: string, from: string, to: string): Promise<WaypointCount | null> {
  const db = await createClient();
  const { data, error } = await db.rpc('recognition_waypoint_counts', { p_from: from, p_to: to, p_employee: userId });
  if (error) {
    if (isMissingFunctionError(error)) return null;
    throw new Error(`Waypoint count failed: ${error.message}`);
  }
  const members = (data as { members?: unknown } | null)?.members;
  const row = (Array.isArray(members) ? members : []).find((m) => (m as { userId?: unknown }).userId === userId) as
    | { total?: unknown; byKey?: unknown }
    | undefined;
  if (!row) throw new Error('Waypoint count unavailable for this member.');
  const byKey: Record<string, number> = {};
  if (row.byKey && typeof row.byKey === 'object') {
    for (const [key, n] of Object.entries(row.byKey)) if (typeof n === 'number') byKey[key] = n;
  }
  return { total: typeof row.total === 'number' ? row.total : 0, byKey };
}
