// PRIVATE. Server-side hall of fame: trophy counts derived by migration 50's
// `recognition_points` (no points are stored), scored with the policy points.
import { createClient } from '@/shared/supabase/server';
import { isMissingSchemaError } from '@/shared/supabase/schema-errors';

import { rankHall, tierFor, type HallOfFameModel, type MemberTrophies, type PolicyPoints, type TrophyEvent } from './hall-rules';
import { parseRecognitionPolicy } from './policy';

interface PointsPayload {
  policy: unknown;
  entries: TrophyEvent[] | null;
  members: MemberTrophies[];
}

/**
 * The company's hall of fame and the viewer's own trophies; null when the
 * database has no migration 50 yet. `policyPoints` (commendations from the
 * policies module, read by the page) adds to each member's points.
 */
export async function getHallOfFame(viewerId: string, policyPoints: PolicyPoints | Promise<PolicyPoints> = {}): Promise<HallOfFameModel | null> {
  const db = await createClient();
  // Read together: the commendation totals are an independent query.
  const [{ data, error }, extra] = await Promise.all([db.rpc('recognition_points', { p_employee: viewerId }), policyPoints]);
  if (error) {
    if (isMissingSchemaError(error.message)) return null;
    throw new Error(`Hall of fame read failed: ${error.message}`);
  }
  const payload = data as unknown as PointsPayload;
  const points = parseRecognitionPolicy({ points: payload.policy }).points;
  const entries = rankHall(payload.members, points, extra);
  const mine = entries.find((e) => e.userId === viewerId);
  return {
    policy: points,
    entries,
    viewer: mine ? { ...mine, progress: tierFor(mine.points) } : null,
    recent: (payload.entries ?? []).slice(0, 12),
  };
}
