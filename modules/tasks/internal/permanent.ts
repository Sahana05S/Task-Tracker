import 'server-only';
import { createClient } from '@/shared/supabase/server';
import { UUID_PATTERN } from '@/shared/forms/form-data';
import type { PermanentMission } from '@/modules/tasks/internal/roadmap-contract';
import type { TaskStatus } from '@/types/tracker';

/** At most this many permanent missions show in the "Always on" strip. */
const PERMANENT_LIMIT = 12;
const COLUMNS = 'id,task_tag,title,status' as const;
interface PermanentRow { id: string; task_tag: string; title: string; status: string }

/**
 * The open permanent missions (migration 135) on which `userId` is Crew: the
 * internal primary row or any `task_assignees` row (migration 121). Two bounded
 * indexed reads, merged by tag. RLS remains authoritative; the database also
 * refuses the timer to anyone who is not Crew.
 */
export async function getMyPermanentMissions(userId: string): Promise<PermanentMission[]> {
  if (!UUID_PATTERN.test(userId)) return [];
  const db = await createClient();
  const [primary, crew] = await Promise.all([
    db.from('tasks').select(COLUMNS).eq('assignee_id', userId)
      .eq('is_permanent', true).neq('status', 'Discarded').is('archived_effective_date', null)
      .order('task_tag').limit(PERMANENT_LIMIT),
    db.from('tasks').select(`${COLUMNS},task_assignees!inner(user_id)`).eq('task_assignees.user_id', userId)
      .eq('is_permanent', true).neq('status', 'Discarded').is('archived_effective_date', null)
      .order('task_tag').limit(PERMANENT_LIMIT),
  ]);
  if (primary.error || crew.error) throw new Error('Your permanent missions could not be loaded.');
  const byId = new Map<string, PermanentMission>();
  for (const row of [...(primary.data ?? []), ...(crew.data ?? [])] as unknown as PermanentRow[]) {
    byId.set(row.id, { id: row.id, taskTag: row.task_tag, title: row.title, status: row.status as TaskStatus });
  }
  return [...byId.values()].sort((a, b) => a.taskTag.localeCompare(b.taskTag)).slice(0, PERMANENT_LIMIT);
}
