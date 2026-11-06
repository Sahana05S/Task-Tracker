import 'server-only';

import { createClient } from '@/shared/supabase/server';

import { mapNoteCounts, mapQuestNotes, type QuestNotes } from './rules';

/** Quest note reads (migration 132). PRIVATE. Null when the read fails or predates 132. */
export async function getQuestNotes(nodeId: string): Promise<QuestNotes | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('quest_notes', { p_node: nodeId });
  return error ? null : mapQuestNotes(data);
}

/** How many notes each Quest row of a mission has (the row badge); null before 132 or on a failed read. */
export async function getQuestNoteCounts(taskId: string): Promise<Record<string, number> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('quest_note_counts', { p_task: taskId });
  return error ? null : mapNoteCounts(data);
}
