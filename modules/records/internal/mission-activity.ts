import { createClient } from '@/shared/supabase/server';
import type { ActivityCursor } from './activity-mapping';
import {
  MISSION_ACTIVITY_PAGE,
  mapMissionActivity,
  type MissionActivityPage,
  type MissionActivityRow,
} from './mission-activity-mapping';

/** One mission's history read (`mission_activity`, migration 124). PRIVATE. */

const missingFunction = (error: { code?: string }) => error.code === 'PGRST202' || error.code === '42883';

/**
 * One page of the mission's history, newest first, as the database lets the
 * caller see it (the managing director and the mission's people). `names`
 * maps member ids to names. Returns `{ available: false }` before migration
 * 124 or when the caller may not read the mission's work; throws on any
 * other failure.
 */
export async function getMissionActivity(
  taskId: string,
  before: ActivityCursor | null,
  names: ReadonlyMap<string, string>,
  limit = MISSION_ACTIVITY_PAGE,
): Promise<MissionActivityPage> {
  const size = Math.min(Math.max(limit, 1), 199);
  const db = await createClient();
  const { data, error } = await db.rpc('mission_activity', {
    p_task: taskId,
    p_before: before ? { at: before.at, id: before.id } : undefined,
    p_limit: size + 1,
  });
  if (error) {
    if (missingFunction(error) || error.code === '42501') return { available: false };
    throw new Error(`Mission activity unavailable: ${error.message}`);
  }
  const rows = (data ?? []) as MissionActivityRow[];
  const page = rows.slice(0, size);
  const last = page.at(-1);
  return {
    available: true,
    entries: mapMissionActivity(page, names),
    next: rows.length > size && last ? { at: last.occurred_at, id: last.id } : null,
  };
}
