import { createClient } from '@/shared/supabase/server';

export interface RunningTimer {
  readonly id: string;
  readonly startedAt: string;
  readonly taskTag: string;
  readonly taskTitle: string;
}

/**
 * The signed-in user's running timers, for the shell's "Timer running" pill so a
 * running timer stays one tap away from every page. Row-level security limits
 * this to rows the caller may read. A failure degrades to "none shown" rather
 * than breaking the page; the timer itself remains on its mission page.
 */
export async function getRunningTimers(userId: string): Promise<RunningTimer[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('task_timers')
      .select('id,started_at,tasks!inner(task_tag,title)')
      .eq('user_id', userId)
      .eq('status', 'Running')
      .order('started_at', { ascending: true })
      .limit(5);
    if (error || !data) return [];
    return data.flatMap((row) => {
      const task = Array.isArray(row.tasks) ? row.tasks[0] : row.tasks;
      return task ? [{ id: row.id, startedAt: row.started_at, taskTag: task.task_tag, taskTitle: task.title }] : [];
    });
  } catch {
    return [];
  }
}
