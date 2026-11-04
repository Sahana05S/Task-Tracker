import 'server-only';
import { createClient } from '@/shared/supabase/server';
import { kolkataDate } from '@/shared/time/kolkata';
import { UUID_PATTERN } from '@/shared/forms/form-data';
import {
  compareRoadmapMissions, missionBatchLimit, missionDueFilter, strongerRelationship, ROADMAP_LINK_LIMIT, ROADMAP_RELATIONS,
  type MissionBatchOptions, type RoadmapLink, type RoadmapRelation, type RoadmapMission, type RoadmapMissionBatch,
} from '@/modules/tasks/internal/roadmap-contract';
import type { MissionRelationship } from '@/shared/tracker/enums';
import type { TaskPriority, TaskStatus } from '@/types/tracker';

const COLUMNS = 'id,task_tag,title,priority,status,due_date,progress_percentage,lifecycle_version' as const;
interface MissionRow {
  id: string; task_tag: string; title: string; priority: string; status: string;
  due_date: string | null; progress_percentage: number | null; lifecycle_version?: number | null;
  task_assignees?: { user_id: string; is_primary: boolean; share_units: number | null }[] | null;
  task_reviewers?: { user_id: string; reviewer_role: string }[] | null;
}

/** The relationship one source row proves; the primary-assignee source is always 'owner'. */
function rowRelationship(row: MissionRow, source: 'primary' | 'participant' | 'reviewer'): MissionRelationship {
  if (source === 'primary') return 'owner';
  if (source === 'reviewer') return row.task_reviewers?.[0]?.reviewer_role === 'Observer' ? 'observer' : 'reviewer';
  const a = row.task_assignees?.[0];
  if (a?.is_primary) return 'owner';
  return a && a.share_units === 0 ? 'collaborator' : 'assignee';
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
function mapMission(t: MissionRow, relationship?: MissionRelationship): RoadmapMission {
  return { id: t.id, taskTag: t.task_tag, title: t.title, priority: t.priority as TaskPriority,
    status: t.status as TaskStatus, dueDate: t.due_date, progress: t.progress_percentage,
    lifecycleVersion: t.lifecycle_version ?? 0, ...(relationship ? { relationship } : {}) };
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
  const participant = db.from('tasks').select(`${COLUMNS},task_assignees!inner(user_id,is_primary,share_units)`).eq('task_assignees.user_id', userId);
  // Reviewers and observers (migration 108) only when the caller asks for them.
  const reviewer = db.from('tasks').select(`${COLUMNS},task_reviewers!inner(user_id,reviewer_role)`).eq('task_reviewers.user_id', userId);
  // The whole team (managers): every open mission, with the viewer's own tie where there is one.
  const team = db.from('tasks').select(COLUMNS);
  const sources = (options.scope === 'team' ? ['team', 'primary', 'participant', 'reviewer'] : options.watching ? ['primary', 'participant', 'reviewer'] : ['primary', 'participant']) as ('team' | 'primary' | 'participant' | 'reviewer')[];
  const pick = { team, primary, participant, reviewer };
  const queries = sources.map(source => pick[source]).map(query => {
    let q = query.not('status', 'in', '("Done","Discarded")').is('archived_effective_date', null)
      .order('due_date', { ascending: true, nullsFirst: false }).order('id').limit(limit + 1);
    if (due === 'today') q = q.eq('due_date', today);
    if (due === 'overdue') q = q.lt('due_date', today);
    if (cursor) q = q.or(afterCursor(cursor));
    return q;
  });
  const results = await Promise.all(queries);
  if (results.some(r => r.error)) throw new Error('Your missions could not be loaded. Retry the roadmap.');
  const byId = new Map<string, RoadmapMission>();
  results.forEach((r, i) => {
    for (const row of (r.data ?? []) as unknown as MissionRow[]) {
      const source = sources[i];
      const known = byId.get(row.id)?.relationship;
      const relationship = source === 'team' ? known : strongerRelationship(known, rowRelationship(row, source));
      byId.set(row.id, mapMission(row, relationship));
    }
  });
  const merged = [...byId.values()].sort(compareRoadmapMissions);
  const missions = merged.slice(0, limit);
  const hasMore = merged.length > limit;
  const links = await getMissionLinks(missions.map(m => m.id));
  return { missions, hasMore, links, nextCursor: hasMore ? encodeCursor(missions[missions.length - 1]) : null };
}

/**
 * Stored relations (Subtask, Dependency, Blocks, Related) with at least one end among `ids`, so the client can
 * join batches as they load. Two indexed reads, each bounded; nothing is inferred. RLS remains authoritative.
 */
export async function getMissionLinks(ids: string[]): Promise<RoadmapLink[]> {
  const valid = ids.filter(id => UUID_PATTERN.test(id)).slice(0, 100);
  if (!valid.length) return [];
  const db = await createClient();
  const select = 'predecessor_task_id,successor_task_id,relation_type';
  const reads = await Promise.all(['predecessor_task_id', 'successor_task_id'].map(column => db.from('task_dependencies')
    .select(select).in(column, valid).in('relation_type', [...ROADMAP_RELATIONS]).order('id').limit(ROADMAP_LINK_LIMIT)));
  if (reads.some(r => r.error)) throw new Error('Mission relations could not be loaded. Retry the roadmap.');
  const rows = reads.flatMap(r => (r.data ?? []) as { predecessor_task_id: string; successor_task_id: string; relation_type: string }[]);
  const links = new Map(rows.map(r => [`${r.relation_type}:${r.predecessor_task_id}:${r.successor_task_id}`,
    { from: r.predecessor_task_id, to: r.successor_task_id, relation: r.relation_type as RoadmapRelation }]));
  return [...links.values()].slice(0, ROADMAP_LINK_LIMIT);
}

/**
 * Own-relationship check for lazily opened roadmap branches; never loads full
 * task details. Reviewers and observers pass too (migration 108); the database
 * still refuses their ticks and timers.
 */
export async function getAssignedRoadmapMission(taskId: string, userId: string, options: { anyOpen?: boolean } = {}): Promise<RoadmapMission | null> {
  if (!UUID_PATTERN.test(taskId) || !UUID_PATTERN.test(userId)) return null;
  const db = await createClient();
  const [task, membership, review] = await Promise.all([
    db.from('tasks').select(`${COLUMNS},assignee_id,archived_effective_date`).eq('id', taskId).maybeSingle(),
    db.from('task_assignees').select('user_id,is_primary,share_units').eq('task_id', taskId).eq('user_id', userId).limit(1).maybeSingle(),
    db.from('task_reviewers').select('user_id,reviewer_role').eq('task_id', taskId).eq('user_id', userId).limit(1).maybeSingle(),
  ]);
  if (task.error || membership.error || review.error) throw new Error('Your mission could not be loaded. Retry the roadmap.');
  if (!task.data || task.data.archived_effective_date || ['Done', 'Discarded'].includes(task.data.status)) return null;
  const relationship: MissionRelationship | null = task.data.assignee_id === userId ? 'owner'
    : membership.data ? rowRelationship({ ...task.data, task_assignees: [membership.data] }, 'participant')
    : review.data ? rowRelationship({ ...task.data, task_reviewers: [review.data] }, 'reviewer')
    : null;
  // Managers browsing the whole team open any open mission; it carries no relationship of theirs.
  return relationship ? mapMission(task.data, relationship) : options.anyOpen ? mapMission(task.data) : null;
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
