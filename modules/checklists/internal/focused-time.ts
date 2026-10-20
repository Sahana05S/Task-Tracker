import 'server-only';
import { createClient } from '@/shared/supabase/server';
import type { ChecklistItemTime, RunningItemTimer } from './item-time';

const TIMER = 'id,user_id,task_id,checklist_node_id,started_at,execution_version' as const;
function timer(row: { id: string; user_id: string; task_id: string; checklist_node_id?: string | null; started_at: string; execution_version?: number | null }): RunningItemTimer {
  return { timerId: row.id, version: row.execution_version ?? 0, userId: row.user_id, taskId: row.task_id, nodeId: row.checklist_node_id ?? null, startedAt: row.started_at };
}
/** Only this item's aggregate and two bounded timer lookups; never all task logs/nodes. */
export async function getFocusedChecklistItemTime(taskId: string, nodeId: string, userId: string): Promise<ChecklistItemTime> {
  const db = await createClient();
  const [seconds, running, mine] = await Promise.all([
    db.rpc('checklist_item_seconds', { p_task: taskId, p_node: nodeId }),
    db.from('task_timers').select(TIMER).eq('task_id', taskId).eq('checklist_node_id', nodeId).eq('status', 'Running').limit(1).maybeSingle(),
    db.from('task_timers').select(TIMER).eq('user_id', userId).eq('status', 'Running').limit(1).maybeSingle(),
  ]);
  if (seconds.error && ['PGRST202', '42883'].includes(seconds.error.code)) return { available: false, secondsByNode: new Map(), runningByNode: new Map(), mine: null };
  const failure = seconds.error ?? running.error ?? mine.error;
  if (failure) throw new Error('Item time unavailable. Retry this item.');
  const own = mine.data ? timer(mine.data) : null;
  const here = own?.taskId === taskId && own.nodeId === nodeId ? own : running.data ? timer(running.data) : null;
  return { available: true, secondsByNode: new Map([[nodeId, Number(seconds.data)]]), runningByNode: new Map(here ? [[nodeId, here]] : []), mine: own };
}

/**
 * Running timers for a checklist table: item timers on this task plus the
 * viewer's own running timer. Logged seconds come from the branch rows
 * (`elapsedSeconds`, already a subtree total), so no task log is read here.
 */
export async function getRunningChecklistTimers(taskId: string, userId: string, secondsByNode: ReadonlyMap<string, number>): Promise<ChecklistItemTime> {
  const db = await createClient();
  const [running, mine] = await Promise.all([
    db.from('task_timers').select(TIMER).eq('task_id', taskId).eq('status', 'Running').not('checklist_node_id', 'is', null).limit(50),
    db.from('task_timers').select(TIMER).eq('user_id', userId).eq('status', 'Running').limit(1).maybeSingle(),
  ]);
  // Before migration 34 there is no item tag; item timers are then unavailable.
  if (running.error?.code === '42703' || mine.error?.code === '42703') return { available: false, secondsByNode, runningByNode: new Map(), mine: null };
  if (running.error ?? mine.error) throw new Error('Item timers unavailable. Reload the checklist.');
  const own = mine.data ? timer(mine.data) : null;
  const byNode = new Map<string, RunningItemTimer>();
  for (const row of running.data ?? []) if (row.checklist_node_id) byNode.set(row.checklist_node_id, timer(row));
  // The viewer's own timer wins over a teammate's on the same row.
  if (own?.taskId === taskId && own.nodeId) byNode.set(own.nodeId, own);
  return { available: true, secondsByNode, runningByNode: byNode, mine: own };
}
