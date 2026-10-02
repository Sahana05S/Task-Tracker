import { createClient } from '@/lib/supabase/server';
import {
  mapTasks,
  TASK_COLUMNS,
  withTaskParticipants,
} from '@/lib/tasks/mappers';
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

  const [taskResult, memberResult, assigneeResult, reviewerResult] =
    await Promise.all([
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
    supabase.from('task_assignees').select('task_id, user_id, is_primary'),
    supabase.from('task_reviewers').select('task_id, user_id, is_primary'),
  ]);

  if (taskResult.error) {
    throw new Error(`Failed to load tasks: ${taskResult.error.message}`);
  }
  if (memberResult.error) {
    throw new Error(`Failed to load members: ${memberResult.error.message}`);
  }

  let tasks = mapTasks(taskResult.data);

  if (!assigneeResult.error) {
    const assigneesByTask = new Map<string, string[]>();
    for (const row of assigneeResult.data) {
      const existing = assigneesByTask.get(row.task_id) ?? [];
      if (row.is_primary) {
        existing.unshift(row.user_id);
      } else {
        existing.push(row.user_id);
      }
      assigneesByTask.set(row.task_id, existing);
    }

    tasks = tasks.map((task) =>
      withTaskParticipants(task, {
        assigneeIds: assigneesByTask.get(task.id),
        reviewerIds: task.reviewerIds,
      }),
    );
  }

  if (!reviewerResult.error) {
    const reviewersByTask = new Map<string, string[]>();
    for (const row of reviewerResult.data) {
      const existing = reviewersByTask.get(row.task_id) ?? [];
      if (row.is_primary) {
        existing.unshift(row.user_id);
      } else {
        existing.push(row.user_id);
      }
      reviewersByTask.set(row.task_id, existing);
    }

    tasks = tasks.map((task) =>
      withTaskParticipants(task, {
        assigneeIds: task.assigneeIds,
        reviewerIds: reviewersByTask.get(task.id),
      }),
    );
  }

  return {
    tasks,
    members: memberResult.data.map(mapUser),
  };
}
