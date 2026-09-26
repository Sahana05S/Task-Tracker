import { createClient } from '@/lib/supabase/server';
import { mapTasks, TASK_COLUMNS } from '@/lib/tasks/mappers';
import { mapUser, USER_COLUMNS } from '@/lib/supabase/mappers';
import type { Task, User } from '@/types/tracker';

/**
 * Server-side reads for the task module. RLS decides what comes back; these
 * functions only shape it.
 */

export interface TaskWorkspaceData {
  tasks: Task[];
  /** Every active member, for the assignee and reviewer pickers. */
  members: User[];
}

/**
 * Loads the task grid and the member directory it references.
 *
 * Two round trips rather than one PostgREST embed. The embedded form
 * (`select('*, assignee:users(...)')`) returns a nested shape that has to be
 * flattened before it fits `Task`, and the same member is re-serialised once per
 * task they own. Fetching the directory separately keeps `Task` matching the
 * table and lets the grid resolve names from a map.
 *
 * Both queries are issued together, so this costs one round trip of latency.
 */
export async function getTaskWorkspaceData(): Promise<TaskWorkspaceData> {
  const supabase = await createClient();

  const [taskResult, memberResult] = await Promise.all([
    supabase
      .from('tasks')
      .select(TASK_COLUMNS)
      // Newest assignment first, then tag so the order is stable when several
      // tasks share a date.
      .order('assigned_date', { ascending: false })
      .order('task_tag', { ascending: true }),
    supabase
      .from('users')
      .select(USER_COLUMNS)
      .order('full_name', { ascending: true }),
  ]);

  if (taskResult.error) {
    throw new Error(`Failed to load tasks: ${taskResult.error.message}`);
  }
  if (memberResult.error) {
    throw new Error(`Failed to load members: ${memberResult.error.message}`);
  }

  return {
    tasks: mapTasks(taskResult.data),
    members: memberResult.data.map(mapUser),
  };
}
