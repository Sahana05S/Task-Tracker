import 'server-only';
import { createClient } from '@/shared/supabase/server';
import { parseObjectiveReviews, type ObjectiveReviews } from './review';

/** The mission's objective reviews that are not 'none', and whether the viewer decides them (`checklist_reviews`, 114). */
export async function getObjectiveReviews(taskId: string): Promise<ObjectiveReviews> {
  const db = await createClient();
  const { data, error } = await db.rpc('checklist_reviews', { p_task: taskId });
  if (error) throw new Error(`Objective reviews unavailable: ${error.message}`);
  return parseObjectiveReviews(data);
}
