import 'server-only';

import { createClient } from '@/shared/supabase/server';

import { mapNoteHashtags, mapNotes, type MissionNotes } from './rules';

/**
 * A mission's notes (migration 126; the table of migration 111). PRIVATE. Only
 * the mission's people and the managing director read them (migration 117);
 * the database refuses everyone else. Null when the read fails or the database
 * predates 126: the page then shows no panel and no count.
 */
export async function getMissionNotes(taskId: string): Promise<MissionNotes | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mission_notes', { p_task: taskId });
  if (error) return null;
  return mapNotes(data);
}

/**
 * Per mission, the hashtag slugs its notes carry (only missions whose notes the
 * caller may read). Null on a failed read: the Missions filter then matches
 * mission hashtags only.
 */
export async function getMissionNoteHashtags(taskIds: readonly string[]): Promise<Record<string, string[]> | null> {
  if (!taskIds.length) return {};
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('mission_note_hashtags', { p_tasks: [...taskIds] });
  if (error) return null;
  return mapNoteHashtags(data);
}
