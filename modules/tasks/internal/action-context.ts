import { createClient } from '@/shared/supabase/server';
import { attachTaskParticipants, mapTasks, TASK_COLUMNS } from '@/modules/tasks/internal/mappers';
import { getNativeTemplates } from '@/modules/tasks/internal/native-details';
import type { NativeTemplate } from '@/modules/tasks/internal/details-contract';
import { mapUser, USER_COLUMNS } from '@/shared/supabase/mappers';
import type { Task, User } from '@/types/tracker';

/** What a mission's action menu needs once it is opened. PRIVATE. */
export interface MissionActionContext {
  readonly task: Task;
  /** Every member, for the assignee and reviewer pickers and the copy tools. */
  readonly members: readonly User[];
  readonly templates: readonly NativeTemplate[];
}

/** One mission with its participants, plus the member directory and templates. RLS decides visibility. */
export async function getMissionActionContext(taskId: string): Promise<MissionActionContext | null> {
  const supabase = await createClient();
  const [taskResult, memberResult, assigneeResult, reviewerResult, templates] = await Promise.all([
    supabase.from('tasks').select(TASK_COLUMNS).eq('id', taskId).maybeSingle(),
    supabase.from('users').select(USER_COLUMNS).order('full_name', { ascending: true }),
    supabase.from('task_assignees').select('task_id, user_id, is_primary, share_units').eq('task_id', taskId),
    supabase.from('task_reviewers').select('task_id, user_id, is_primary').eq('task_id', taskId),
    getNativeTemplates().catch(() => [] as NativeTemplate[]),
  ]);
  if (taskResult.error || !taskResult.data || memberResult.error || assigneeResult.error || reviewerResult.error) return null;
  const [task] = attachTaskParticipants(mapTasks([taskResult.data]), assigneeResult.data, reviewerResult.data);
  return { task, members: memberResult.data.map(mapUser), templates };
}
