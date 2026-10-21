import { createClient } from '@/shared/supabase/server';
import type { User } from '@/types/tracker';

import type { RecordMember, TaskChoice } from '../components/dated-record-module';

/** What the quick Post drawer's editor needs: the poster, active members and open missions. */
export interface PostChoices {
  readonly user: Pick<User, 'id' | 'role'>;
  readonly members: readonly RecordMember[];
  readonly tasks: readonly TaskChoice[];
}

/**
 * Members (author and meeting-owner pickers) and open, unarchived missions
 * (related task), read when the drawer opens. `includeTaskId` keeps a preset
 * mission in the list even if it is closed. Row-level security decides what
 * the caller may see; errors throw so the drawer shows them.
 */
export async function getPostChoices(user: Pick<User, 'id' | 'role'>, includeTaskId?: string): Promise<PostChoices> {
  const db = await createClient();
  const [members, tasks, preset] = await Promise.all([
    db.from('users').select('id, full_name, is_active').eq('is_active', true).order('full_name'),
    db.from('tasks').select('id, task_tag, title').not('status', 'in', '(Done,Discarded)').is('archived_effective_date', null).order('task_tag'),
    includeTaskId ? db.from('tasks').select('id, task_tag, title').eq('id', includeTaskId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  for (const result of [members, tasks, preset]) if (result.error) throw new Error(`Post choices unavailable: ${result.error.message}`);
  const choices = tasks.data!.map((t) => ({ id: t.id, tag: t.task_tag, title: t.title }));
  if (preset.data && !choices.some((t) => t.id === preset.data!.id)) {
    choices.unshift({ id: preset.data.id, tag: preset.data.task_tag, title: preset.data.title });
  }
  return {
    user: { id: user.id, role: user.role },
    members: members.data!.map((m) => ({ id: m.id, fullName: m.full_name, isActive: m.is_active })),
    tasks: choices,
  };
}
