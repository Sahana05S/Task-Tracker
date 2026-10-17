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
/** PostgREST / PostgreSQL "function not found" (database predates migration 36). */
const MISSING_FUNCTION = new Set(['PGRST202', '42883']);

export interface TaskEffortBreakdown {
  /** Asia/Kolkata business date the "today" figure covers. */
  today: string;
  /** Unreversed hours logged on the task today, by everyone. */
  todayHours: number;
  /** Unreversed logged seconds per checklist item, by everyone. */
  secondsByNode: ReadonlyMap<string, number>;
}

/**
 * Team-wide task effort totals (migration 36). Logs are readable only by their
 * author and managers, so summing visible logs would understate a member's
 * view; this SECURITY DEFINER aggregate returns totals only. Null when the
 * database predates migration 36.
 */
export async function getTaskEffortBreakdown(taskId: string): Promise<TaskEffortBreakdown | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('task_effort_breakdown', { p_task_id: taskId });
  if (error) {
    if (MISSING_FUNCTION.has(error.code)) return null;
    throw new Error(`Failed to load task effort breakdown: ${error.message}`);
  }
  const raw = (data ?? {}) as { today?: string; today_hours?: number | string; by_node?: Record<string, number | string> };
  return {
    today: raw.today ?? '',
    todayHours: Number(raw.today_hours ?? 0),
    secondsByNode: new Map(Object.entries(raw.by_node ?? {}).map(([id, seconds]) => [id, Number(seconds)])),
  };
}

/**
 * Item time for one task's checklist pages. Item timers are ordinary task
 * timers whose stop writes ordinary task logs tagged with the item
 * (migration 34), so these hours are already part of task hours. Logged time
 * is the team-wide total; running timers are those the viewer may read.
 */
export async function getChecklistItemTime(taskId: string, userId: string): Promise<ChecklistItemTime> {
  const supabase = await createClient();
  const [breakdown, running, mine] = await Promise.all([
    getTaskEffortBreakdown(taskId),
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
  if (!breakdown || [running.error, mine.error].some(e => e?.code === UNDEFINED_COLUMN)) {
    return { available: false, secondsByNode: new Map(), runningByNode: new Map(), mine: null };
  }
  const failure = running.error ?? mine.error;
  if (failure) throw new Error(failure.message);
  const secondsByNode = breakdown.secondsByNode;
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
