import 'server-only';

import { createClient } from '@/shared/supabase/server';
import { buildMoveTargets, type MoveTarget } from './move-target-rules';

/**
 * Where a row of this mission may move (migration 133), for the row menu. PRIVATE. Returns null
 * when the read fails (or the database predates 133), so the menu simply offers no move.
 */
export async function getMoveTargets(taskId: string): Promise<MoveTarget[] | null> {
  const db = await createClient();
  const { data, error } = await db.rpc('checklist_move_targets', { p_task: taskId });
  return error ? null : buildMoveTargets(data);
}
