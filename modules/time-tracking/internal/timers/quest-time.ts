import 'server-only';

import { createClient } from '@/shared/supabase/server';
import type { QuestTime } from '@/modules/time-tracking/internal/timers/quest-time-types';

/**
 * A mission's Quests with their logged time, own and including sub-Quests
 * (`quest_time`, migration 123). Only the mission's people and the managing
 * director may read it (117); a refused or missing read returns null, so the
 * page falls back to the mission timer.
 */
export async function getQuestTimes(taskId: string): Promise<QuestTime[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('quest_time', { p_task: taskId });
  if (error || !data) return null;
  return data.map((row) => ({
    nodeId: row.node_id,
    ownedChecklistId: row.owned_checklist_id,
    checklistId: row.checklist_id,
    parentQuestId: row.parent_quest_id,
    title: row.title,
    assigneeId: row.assignee_id,
    ownSeconds: Number(row.own_seconds ?? 0),
    totalSeconds: Number(row.total_seconds ?? 0),
  }));
}
