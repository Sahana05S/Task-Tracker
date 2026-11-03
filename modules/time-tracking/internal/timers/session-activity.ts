import 'server-only';

import { createClient } from '@/shared/supabase/server';
import { mapSessionActivity, type TimerSessionActivity } from '@/modules/time-tracking/internal/timers/session-wording';

/**
 * What each stopped timer on a mission covered: the commands its owner ran on
 * the mission and its checklists between start and stop (`timer_session_activity`,
 * migration 110). Managers read every session, members their own. A database
 * without migration 110 (PGRST202 / 42883) reads as unavailable, not empty.
 */
export async function getTimerSessionActivity(taskId: string): Promise<
  { available: true; sessions: ReadonlyMap<string, TimerSessionActivity> } | { available: false }
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('timer_session_activity', { p_task: taskId, p_limit: 50 });
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') return { available: false };
    throw new Error(`Failed to load timer sessions: ${error.message}`);
  }
  return { available: true, sessions: new Map((data ?? []).map((row) => [row.timer_id, mapSessionActivity(row)])) };
}
