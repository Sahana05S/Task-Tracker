import 'server-only';
import { createClient } from '@/shared/supabase/server';
import { kolkataDate } from '@/shared/time/kolkata';
import { UUID_PATTERN } from '@/shared/forms/form-data';
import {
  compareRoadmapMissions, missionBatchLimit, missionDueFilter,
  type MissionBatchOptions, type RoadmapMission, type RoadmapMissionBatch,
} from '@/modules/tasks/internal/roadmap-contract';
import type { TaskPriority, TaskStatus } from '@/types/tracker';

const COLUMNS = 'id,task_tag,title,priority,status,due_date,progress_percentage,lifecycle_version' as const;
interface MissionRow {
  id: string; task_tag: string; title: string; priority: string; status: string;
  due_date: string | null; progress_percentage: number | null; lifecycle_version?: number | null;
}
interface Cursor { due: string | null; id: string }
function decodeCursor(value?: string | null): Cursor | null {
  if (!value) return null;
  if (value.length > 512) throw new Error('Invalid mission cursor. Reload your roadmap.');
  try {
    const c = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Cursor;
    if (!UUID_PATTERN.test(c.id) || !(c.due === null || /^\d{4}-\d{2}-\d{2}$/.test(c.due))) throw new Error();
    return c;
  } catch { throw new Error('Invalid mission cursor. Reload your roadmap.'); }
}
function encodeCursor(mission: RoadmapMission): string {
  return Buffer.from(JSON.stringify({ due: mission.dueDate, id: mission.id })).toString('base64url');
}
function afterCursor(cursor: Cursor): string {
  // Every interpolated value was validated above before entering PostgREST syntax.
  const suffix = `id.gt.${cursor.id}`;
  return cursor.due === null
    ? `and(due_date.is.null,or(${suffix}))`
    : `due_date.gt.${cursor.due},due_date.is.null,and(due_date.eq.${cursor.due},or(${suffix}))`;
}
function mapMission(t: MissionRow): RoadmapMission {
  return { id: t.id, taskTag: t.task_tag, title: t.title, priority: t.priority as TaskPriority,
    status: t.status as TaskStatus, dueDate: t.due_date, progress: t.progress_percentage,
    lifecycleVersion: t.lifecycle_version ?? 0 };
}

/** Two bounded indexed sources preserve legacy primaries and participant ownership.
 * Merge before truncating, then keyset both sources after the last emitted row.
 * No all-task IDs, directory, checklist trees, or offset walk is fetched. RLS remains authoritative.
 */
export async function getAssignedMissionBatch(userId: string, options: MissionBatchOptions = {}, now = new Date()): Promise<RoadmapMissionBatch> {
  if (!UUID_PATTERN.test(userId)) throw new Error('Active assignment required.');
  const db = await createClient();
  const limit = missionBatchLimit(options.limit);
  const due = missionDueFilter(options.due);
  const today = kolkataDate(now);
  const cursor = decodeCursor(options.cursor);
  const primary = db.from('tasks').select(COLUMNS).eq('assignee_id', userId);
  const participant = db.from('tasks').select(`${COLUMNS},task_assignees!inner(user_id)`).eq('task_assignees.user_id', userId);
  const queries = [primary, participant].map(query => {
    let q = query.not('status', 'in', '("Done","Discarded")').is('archived_effective_date', null)
      .order('due_date', { ascending: true, nullsFirst: false }).order('id').limit(limit + 1);
    if (due === 'today') q = q.eq('due_date', today);
    if (due === 'overdue') q = q.lt('due_date', today);
    if (cursor) q = q.or(afterCursor(cursor));
    return q;
  });
  const results = await Promise.all(queries);
  if (results.some(r => r.error)) throw new Error('Your missions could not be loaded. Retry the roadmap.');
  const rows = results.flatMap(r => (r.data ?? []) as unknown as MissionRow[]);
  const merged = [...new Map(rows.map(row => [row.id, mapMission(row)])).values()].sort(compareRoadmapMissions);
  const missions = merged.slice(0, limit);
  const hasMore = merged.length > limit;
  return { missions, hasMore, nextCursor: hasMore ? encodeCursor(missions[missions.length - 1]) : null };
}

/** Own-assignment check for lazily opened roadmap branches; never loads full task details. */
export async function getAssignedRoadmapMission(taskId: string, userId: string): Promise<RoadmapMission | null> {
  if (!UUID_PATTERN.test(taskId) || !UUID_PATTERN.test(userId)) return null;
  const db = await createClient();
  const [task, membership] = await Promise.all([
    db.from('tasks').select(`${COLUMNS},assignee_id,archived_effective_date`).eq('id', taskId).maybeSingle(),
    db.from('task_assignees').select('task_id').eq('task_id', taskId).eq('user_id', userId).limit(1).maybeSingle(),
  ]);
  if (task.error || membership.error) throw new Error('Your mission could not be loaded. Retry the roadmap.');
  if (!task.data || task.data.archived_effective_date || ['Done', 'Discarded'].includes(task.data.status)
    || (task.data.assignee_id !== userId && !membership.data)) return null;
  return mapMission(task.data);
}

/** Counts owned/participant completions without fetching a member's entire task history. */
export async function countAssignedMissionsCompletedBetween(userId: string, from: string, to: string): Promise<number> {
  if (!UUID_PATTERN.test(userId)) throw new Error('Active assignment required.');
  const db = await createClient();
  const primary = db.from('tasks').select('id', { count: 'exact', head: true }).eq('assignee_id', userId);
  const participant = db.from('tasks').select('id,task_assignees!inner(user_id)', { count: 'exact', head: true })
    .eq('task_assignees.user_id', userId).neq('assignee_id', userId);
  const counts = await Promise.all([primary, participant].map(q => q.eq('status', 'Done').gte('completed_date', from).lte('completed_date', to)));
  if (counts.some(r => r.error)) throw new Error('Completed missions unavailable.');
  return counts.reduce((sum, r) => sum + (r.count ?? 0), 0);
}
