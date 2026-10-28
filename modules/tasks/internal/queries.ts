import { createClient } from '@/shared/supabase/server';
import {
  mapTasks,
  TASK_COLUMNS,
  attachSubMissionParents,
  attachTaskParticipants,
} from '@/modules/tasks/internal/mappers';
import { mapUser, USER_COLUMNS } from '@/shared/supabase/mappers';
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

/** A mission as a pick-list entry. */
export interface MissionChoice {
  readonly id: string;
  readonly taskTag: string;
  readonly title: string;
}

/**
 * Every mission as tag and title, for "Link to a mission" and related-task
 * pickers. One narrow read instead of the whole Missions list (with people,
 * shares and links), which the checklist and mission pages used to load just
 * for these menus (slow pages, 28 October 2026).
 */
export async function getMissionChoices(): Promise<MissionChoice[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('tasks').select('id, task_tag, title').order('task_tag', { ascending: true });
  if (error) throw new Error(`Failed to load missions: ${error.message}`);
  return data.map((row) => ({ id: row.id, taskTag: row.task_tag, title: row.title }));
}

/**
 * Loads the task grid and the member directory it references.
 *
 * Four parallel reads rather than a PostgREST embed. The embedded form
 * (`select('*, assignee:users(...)')`) returns a nested shape that has to be
 * flattened before it fits `Task`, and the same member is re-serialised once per
 * task they own. Fetching the directory separately keeps `Task` matching the
 * table and lets the grid resolve names from a map.
 *
 * The reads run together; participant joins are indexed once in memory.
 */
export async function getTaskWorkspaceData(): Promise<TaskWorkspaceData> {
  const supabase = await createClient();

  const [taskResult, memberResult, assigneeResult, reviewerResult, subtaskResult] =
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
    supabase.from('task_assignees').select('task_id, user_id, is_primary, share_units'),
    supabase.from('task_reviewers').select('task_id, user_id, is_primary'),
    // Sub-missions, so the list can nest them under their parent.
    supabase.from('task_dependencies').select('predecessor_task_id, successor_task_id').eq('relation_type', 'Subtask'),
  ]);

  if (taskResult.error) {
    throw new Error(`Failed to load tasks: ${taskResult.error.message}`);
  }
  if (memberResult.error) {
    throw new Error(`Failed to load members: ${memberResult.error.message}`);
  }
  if (assigneeResult.error) throw new Error(`Failed to load participants: ${assigneeResult.error.message}`);
  if (reviewerResult.error) throw new Error(`Failed to load reviewers: ${reviewerResult.error.message}`);
  if (subtaskResult.error) throw new Error(`Failed to load sub-missions: ${subtaskResult.error.message}`);

  const tasks = attachSubMissionParents(
    attachTaskParticipants(mapTasks(taskResult.data), assigneeResult.data, reviewerResult.data),
    subtaskResult.data,
  );

  return {
    tasks,
    members: memberResult.data.map(mapUser),
  };
}
