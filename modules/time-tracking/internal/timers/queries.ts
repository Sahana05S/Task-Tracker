import { createClient } from '@/shared/supabase/server';

/** A running timer anywhere in the team, as Task Tools lists it. */
export interface TeamRunningTimer {
  id: string;
  taskId: string;
  userId: string;
  startedAt: string;
  executionVersion: number;
}

/** Every running timer the caller may read, newest first. */
export async function getTeamRunningTimers(): Promise<TeamRunningTimer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('task_timers')
    .select('id, task_id, user_id, started_at, execution_version')
    .eq('status', 'Running')
    .order('started_at', { ascending: false });

  if (error) throw new Error(`Failed to load running timers: ${error.message}`);
  return data.map((row) => ({
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    startedAt: row.started_at,
    executionVersion: row.execution_version ?? 0,
  }));
}
