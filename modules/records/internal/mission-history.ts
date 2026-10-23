import { createClient } from '@/shared/supabase/server';
import { groupMissionHistory, type MissionChange, type MissionHistoryRow } from './mission-history-mapping';

/** The mission change log read (`mission_history`, migration 70). PRIVATE. */

export type MissionHistoryPage =
  | { available: true; changes: MissionChange[]; next: string | null }
  | { available: false };

/** Actions per page; the database allows at most 100. */
export const MISSION_HISTORY_PAGE = 30;

/** PostgREST "function not found" or PostgreSQL "undefined function": migration 70 is not applied here. */
const missingFunction = (error: { code?: string }) => error.code === 'PGRST202' || error.code === '42883';

/**
 * One page of a mission's changes, newest first, one entry per action with
 * every value it changed. Managers, assignees and reviewers see everyone's
 * actions; other members only their own (the database decides). `before` is
 * the `next` of the previous page. Returns `{ available: false }` before
 * migration 70; throws on any other failure.
 */
export async function getMissionHistory(taskId: string, before: string | null): Promise<MissionHistoryPage> {
  const db = await createClient();
  const [history, users] = await Promise.all([
    db.rpc('mission_history', { p_task: taskId, p_before: before ?? undefined, p_limit: MISSION_HISTORY_PAGE + 1 }),
    db.from('users').select('id, full_name, employee_id'),
  ]);
  if (history.error) {
    if (missingFunction(history.error)) return { available: false };
    throw new Error(`Mission history unavailable: ${history.error.message}`);
  }
  if (users.error) throw new Error(`Mission history attribution unavailable: ${users.error.message}`);
  const people = new Map((users.data ?? []).map((user) => [user.id, { id: user.id, fullName: user.full_name, employeeId: user.employee_id }]));
  const changes = groupMissionHistory((history.data ?? []) as MissionHistoryRow[], people);
  const page = changes.slice(0, MISSION_HISTORY_PAGE);
  return {
    available: true,
    changes: page,
    next: changes.length > MISSION_HISTORY_PAGE ? page.at(-1)?.at ?? null : null,
  };
}

/** `before` from the URL: an ISO time, anything else means the first page. */
export const parseHistoryCursor = (value: string | string[] | undefined): string | null =>
  typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;
