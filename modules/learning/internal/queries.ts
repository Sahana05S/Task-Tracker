import 'server-only';

import { createClient } from '@/shared/supabase/server';

import { mapLearnings, type MissionLearnings } from './rules';

/**
 * A mission's Mistakes and learning (migration 111). PRIVATE. Every active
 * member of the company reads them. Null when the database predates 111 or the
 * read fails: the page then shows no panel and no count.
 */
export async function getMissionLearnings(taskId: string): Promise<MissionLearnings | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mission_learnings', { p_task: taskId });
  if (error) return null;
  return mapLearnings(data);
}
