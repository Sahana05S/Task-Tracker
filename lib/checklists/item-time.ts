import 'server-only';

import { createClient } from '@/lib/supabase/server';

/** A running timer, as the checklist pages need it. */
export interface RunningItemTimer {
  timerId: string;
  version: number;
  userId: string;
  taskId: string;
  nodeId: string | null;
  startedAt: string;
}

export interface ChecklistItemTime {
  /** False when the database predates migration 34 (no item tags yet). */
  available: boolean;
  /** Logged seconds per checklist item, from tagged, unreversed task logs. */
  secondsByNode: ReadonlyMap<string, number>;
  /** Running item timers on this task, by item. */
  runningByNode: ReadonlyMap<string, RunningItemTimer>;
  /** The signed-in user's running timer on any task, if any. */
  mine: RunningItemTimer | null;
}

const UNDEFINED_COLUMN = '42703';

/**
 * Item time for one task's checklist pages. Item timers are ordinary task
 * timers whose stop writes ordinary task logs tagged with the item
 * (migration 34), so these hours are already part of task hours.
 */
export async function getChecklistItemTime(taskId: string, userId: string): Promise<ChecklistItemTime> {
  const supabase = await createClient();
  const [logs, running, mine] = await Promise.all([
    supabase
      .from('daily_task_logs')
      .select('checklist_node_id, hours_worked')
      .eq('task_id', taskId)
      .is('reversed_at', null)
      .not('checklist_node_id', 'is', null),
    supabase
      .from('task_timers')
      .select('id, user_id, task_id, checklist_node_id, started_at, execution_version')
      .eq('task_id', taskId)
      .eq('status', 'Running')
      .not('checklist_node_id', 'is', null),
    supabase
      .from('task_timers')
      .select('id, user_id, task_id, checklist_node_id, started_at, execution_version')
      .eq('user_id', userId)
      .eq('status', 'Running')
      .limit(1)
      .maybeSingle(),
  ]);
  if ([logs.error, running.error, mine.error].some(e => e?.code === UNDEFINED_COLUMN)) {
    return { available: false, secondsByNode: new Map(), runningByNode: new Map(), mine: null };
  }
  const failure = logs.error ?? running.error ?? mine.error;
  if (failure) throw new Error(failure.message);

  const secondsByNode = new Map<string, number>();
  for (const row of logs.data ?? []) {
    if (!row.checklist_node_id) continue;
    secondsByNode.set(row.checklist_node_id, (secondsByNode.get(row.checklist_node_id) ?? 0) + Math.round(Number(row.hours_worked) * 3600));
  }
  const toTimer = (row: { id: string; user_id: string; task_id: string; checklist_node_id?: string | null; started_at: string; execution_version?: number | null }): RunningItemTimer => ({
    timerId: row.id,
    version: row.execution_version ?? 0,
    userId: row.user_id,
    taskId: row.task_id,
    nodeId: row.checklist_node_id ?? null,
    startedAt: row.started_at,
  });
  const runningByNode = new Map<string, RunningItemTimer>();
  for (const row of running.data ?? []) {
    if (!row.checklist_node_id) continue;
    // Prefer the signed-in user's own timer when several people time one item.
    if (!runningByNode.has(row.checklist_node_id) || row.user_id === userId) runningByNode.set(row.checklist_node_id, toTimer(row));
  }
  return { available: true, secondsByNode, runningByNode, mine: mine.data ? toTimer(mine.data) : null };
}
