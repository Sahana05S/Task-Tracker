import { createClient } from '@/shared/supabase/server';
import type { TaskPriority, TaskStatus } from '@/types/tracker';

/**
 * A member's own tasks, for the Today page. Each read throws on a query error
 * so the caller can show its section as unavailable, never as zero. PRIVATE.
 */

export interface MemberOpenTask {
  id: string;
  taskTag: string;
  title: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | null;
  progress: number | null;
}

/** Ids of the tasks the member owns or is a participant on. */
export async function getMemberTaskIds(userId: string): Promise<string[]> {
  const db = await createClient();
  const [owned, assigned] = await Promise.all([
    db.from('tasks').select('id').eq('assignee_id', userId),
    db.from('task_assignees').select('task_id').eq('user_id', userId),
  ]);
  if (owned.error || assigned.error) throw new Error('Assigned missions unavailable');
  return [...new Set([...owned.data.map((r) => r.id), ...assigned.data.map((r) => r.task_id)])];
}

/** The given tasks that are still open (not Done, not Discarded) and not archived. Unsorted. */
export async function getOpenTasksByIds(ids: string[]): Promise<MemberOpenTask[]> {
  const db = await createClient();
  const { data, error } = await db
    .from('tasks')
    .select('id,task_tag,title,priority,status,due_date,progress_percentage')
    .in('id', ids)
    .not('status', 'in', '("Done","Discarded")')
    .is('archived_effective_date', null);
  if (error) throw error;
  return data.map((t) => ({ id: t.id, taskTag: t.task_tag, title: t.title, priority: t.priority as TaskPriority,
    status: t.status as TaskStatus, dueDate: t.due_date, progress: t.progress_percentage }));
}

/** How many of the given tasks were completed (Done) between two dates, inclusive. */
export async function countTasksCompletedBetween(ids: string[], from: string, to: string): Promise<number> {
  if (ids.length === 0) return 0;
  const db = await createClient();
  const { count, error } = await db.from('tasks').select('id', { count: 'exact', head: true }).in('id', ids)
    .eq('status', 'Done').gte('completed_date', from).lte('completed_date', to);
  if (error) throw error;
  return count ?? 0;
}
