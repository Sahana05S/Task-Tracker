import { createClient } from '@/shared/supabase/server';
import {
  ACTIVITY_MAX_PAGE,
  mapActivity,
  type ActivityCursor,
  type ActivityEntry,
  type ActivityFilter,
  type ActivityRow,
  type Person,
} from './activity-mapping';

/** The activity log read (`activity_feed`, migration 54). PRIVATE. */

export type ActivityPage =
  | { available: true; entries: ActivityEntry[]; next: ActivityCursor | null; people: Person[] }
  | { available: false };

/** PostgREST "function not found" or PostgreSQL "undefined function": migration 54 is not applied here. */
const missingFunction = (error: { code?: string }) => error.code === 'PGRST202' || error.code === '42883';

/**
 * One page of the company's activity, newest first, as the database lets the
 * caller see it (managers: everyone; members: their own and about them).
 * `limit` rows at most (capped at ACTIVITY_MAX_PAGE); `next` is the cursor
 * for the following page.
 * `known` reuses a member list from an earlier page instead of reading it again.
 * Returns `{ available: false }` when the database has no `activity_feed`
 * yet; throws on any other failure.
 */
export async function getActivity(
  filter: ActivityFilter,
  before: ActivityCursor | null,
  limit: number,
  known?: Person[],
): Promise<ActivityPage> {
  const size = Math.min(Math.max(limit, 1), ACTIVITY_MAX_PAGE);
  const db = await createClient();
  const [feed, users] = await Promise.all([
    db.rpc('activity_feed', {
      p_from: filter.from,
      p_to: filter.to,
      p_kind: filter.kind ?? undefined,
      p_member: filter.member ?? undefined,
      p_before: before ? { at: before.at, id: before.id } : undefined,
      p_limit: size + 1,
    }),
    known ? null : db.from('users').select('id, full_name, employee_id'),
  ]);
  if (feed.error) {
    if (missingFunction(feed.error)) return { available: false };
    throw new Error(`Activity unavailable: ${feed.error.message}`);
  }
  if (users?.error) throw new Error(`Activity attribution unavailable: ${users.error.message}`);
  const rows = (feed.data ?? []) as ActivityRow[];
  const people = known ?? (users?.data ?? [])
    .map((user) => ({ id: user.id, fullName: user.full_name, employeeId: user.employee_id }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  const byId = new Map(people.map((person) => [person.id, person]));
  const page = rows.slice(0, size);
  const last = page.at(-1);
  return {
    available: true,
    entries: page.map((row) => mapActivity(row, byId)),
    next: rows.length > size && last ? { at: last.occurred_at, id: last.id } : null,
    people,
  };
}
