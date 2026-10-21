import { createClient } from '@/shared/supabase/server';
import type { Task, TaskRelationType, User } from '@/types/tracker';

/**
 * "Recent operations" on the Tools page. PRIVATE.
 *
 * The retained previews and command receipts (migrations 24-25) live in the
 * private schema, and this change adds no migration, so the list is rebuilt
 * from what Task Tools leaves in public tables: every copy writes a lineage
 * row in `task_dependencies` with the note below (one commit shares one
 * `created_at`, so rows group into operations), and archives stamp the task.
 * Done, reopen, section and refresh batches leave no such trace; they show up
 * once the activity log (migration 54) can be read.
 */

/** Written by `task_tools_command` (24, 25) on every copy it creates. */
export const TOOL_LINEAGE_NOTE = 'M09 native lineage; no provider asset copied';

const LINEAGE_LIMIT = 200;

const TAG_ORDER = new Intl.Collator(undefined, { numeric: true });

export interface LineageRow {
  predecessorTaskId: string;
  successorTaskId: string;
  relationType: TaskRelationType;
  createdBy: string | null;
  createdAt: string;
}

export type RecentOperationKind = 'copy' | 'support' | 'carryover' | 'archive';

export interface RecentToolOperation {
  key: string;
  kind: RecentOperationKind;
  /** ISO timestamp for copies; an IST calendar date for archives. */
  at: string;
  actorName: string | null;
  source: { taskTag: string; title: string } | null;
  /** Created missions (copies) or archived missions (archive). */
  tasks: { taskTag: string; title: string }[];
  reason: string | null;
}

export async function getToolLineage(): Promise<LineageRow[]> {
  const client = await createClient();
  const { data, error } = await client
    .from('task_dependencies')
    .select('predecessor_task_id, successor_task_id, relation_type, created_by, created_at')
    .eq('notes', TOOL_LINEAGE_NOTE)
    .order('created_at', { ascending: false })
    .limit(LINEAGE_LIMIT);
  if (error) throw new Error(`Recent operations unavailable: ${error.message}`);
  const rows = data ?? [];
  // A full page may end inside a batch; drop that oldest commit rather than
  // report it with a partial count.
  const cut = rows.length === LINEAGE_LIMIT ? rows[rows.length - 1].created_at : null;
  return rows.filter((row) => row.created_at !== cut).map((row) => ({
    predecessorTaskId: row.predecessor_task_id,
    successorTaskId: row.successor_task_id,
    relationType: row.relation_type,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }));
}

const KIND_BY_RELATION: Partial<Record<TaskRelationType, RecentOperationKind>> = {
  Support: 'support',
  Carryover: 'carryover',
};

/**
 * Groups lineage rows into operations and adds the archives, newest first.
 * Missions the reader cannot see (RLS) are left out rather than shown as ids.
 */
export function buildRecentOperations(
  lineage: readonly LineageRow[],
  tasks: readonly Task[],
  members: readonly User[],
  limit = 25,
): RecentToolOperation[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const names = new Map(members.map((member) => [member.id, member.fullName]));
  const brief = (task: Task) => ({ taskTag: task.taskTag, title: task.title });
  const operations = new Map<string, RecentToolOperation>();

  for (const row of lineage) {
    const created = byId.get(row.successorTaskId);
    if (!created) continue;
    const key = `${row.createdAt}|${row.createdBy ?? ''}|${row.predecessorTaskId}|${row.relationType}`;
    let operation = operations.get(key);
    if (!operation) {
      const source = byId.get(row.predecessorTaskId);
      operation = {
        key,
        kind: KIND_BY_RELATION[row.relationType] ?? 'copy',
        at: row.createdAt,
        actorName: row.createdBy ? (names.get(row.createdBy) ?? null) : null,
        source: source ? brief(source) : null,
        tasks: [],
        reason: row.relationType === 'Carryover' ? (source?.archiveReason ?? null) : null,
      };
      operations.set(key, operation);
    }
    operation.tasks.push(brief(created));
  }

  // Carryover archives its source with a successor; that is shown as the carryover.
  for (const task of tasks) {
    if (!task.archivedEffectiveDate || task.handoffSuccessorId) continue;
    const key = `archive|${task.archivedEffectiveDate}|${task.archiveReason ?? ''}`;
    const operation = operations.get(key) ?? {
      key,
      kind: 'archive' as const,
      at: task.archivedEffectiveDate,
      actorName: null,
      source: null,
      tasks: [],
      reason: task.archiveReason ?? null,
    };
    operation.tasks.push(brief(task));
    operations.set(key, operation);
  }

  for (const operation of operations.values()) {
    operation.tasks.sort((a, b) => TAG_ORDER.compare(a.taskTag, b.taskTag));
  }
  return [...operations.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}


