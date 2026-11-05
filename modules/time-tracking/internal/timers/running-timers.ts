import { createClient } from '@/shared/supabase/server';

export interface RunningTimer {
  readonly id: string;
  /** Sent back as `expectedVersion` when the timer is stopped from the shell. */
  readonly executionVersion: number;
  readonly startedAt: string;
  readonly taskId: string;
  readonly taskTag: string;
  readonly taskTitle: string;
  /** The Quest this timer runs on (migration 123); null for a mission timer. */
  readonly nodeId?: string | null;
  /** That Quest's title, for "TAG › Quest" labels; null when unknown or a mission timer. */
  readonly questTitle?: string | null;
  /** The session note so far (the start note); the Stop sheet offers it for editing. */
  readonly notes?: string | null;
}

/** The mission ids, among those the caller may read, that have Quests (migration 123: timed on their Quests). */
export async function getQuestMissionIds(): Promise<string[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from('task_checklists').select('task_id').not('owner_node_id', 'is', null).limit(5000);
    if (error || !data) return [];
    return [...new Set(data.map((row) => row.task_id))];
  } catch {
    return [];
  }
}

/**
 * The signed-in user's running timers, for the shell's "Timer running" pill and
 * the timer buttons (`RunningTimerProvider`), so a running timer stays one tap
 * away from every page. Row-level security limits
 * this to rows the caller may read. A failure degrades to "none shown" rather
 * than breaking the page; the timer itself remains on its mission page.
 */
export async function getRunningTimers(userId: string): Promise<RunningTimer[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('task_timers')
      .select('id,execution_version,started_at,task_id,notes,checklist_node_id,tasks!inner(task_tag,title)')
      .eq('user_id', userId)
      .eq('status', 'Running')
      .order('started_at', { ascending: true })
      .limit(20);
    if (error || !data) return [];
    // Quest titles (migration 123); a failed read only leaves the labels at the mission tag.
    const nodeIds = [...new Set(data.flatMap((row) => (row.checklist_node_id ? [row.checklist_node_id] : [])))];
    const titles = new Map<string, string>();
    if (nodeIds.length) {
      const nodes = await supabase.from('checklist_nodes').select('id,title').in('id', nodeIds);
      for (const node of nodes.data ?? []) titles.set(node.id, node.title);
    }
    return data.flatMap((row) => {
      const task = Array.isArray(row.tasks) ? row.tasks[0] : row.tasks;
      const nodeId = row.checklist_node_id ?? null;
      return task ? [{
        id: row.id, executionVersion: row.execution_version ?? 0, startedAt: row.started_at,
        taskId: row.task_id, taskTag: task.task_tag, taskTitle: task.title, notes: row.notes,
        nodeId, questTitle: nodeId ? titles.get(nodeId) ?? null : null,
      }] : [];
    });
  } catch {
    return [];
  }
}
