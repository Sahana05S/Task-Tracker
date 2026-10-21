// PRIVATE. Server-side hall of fame: trophy counts derived by migration 50's
// `recognition_points` (no points are stored), scored with the policy points.
import type { Factor } from '@/modules/scoring/client';
import { createClient } from '@/shared/supabase/server';
import { isMissingSchemaError } from '@/shared/supabase/schema-errors';

import { rankHall, tierFor, type HallOfFameModel, type TrophyCounts } from './hall-rules';
import { parseRecognitionPolicy } from './policy';

interface PointsPayload {
  policy: unknown;
  entries: { kind: 'dailyStar' | 'categoryAward' | 'monthlyStar'; date: string; category: Factor | null }[] | null;
  members: (TrophyCounts & { userId: string; name: string })[];
}

/** Thrown when the database has no migration 50 yet, so the page can say so. */
export class HallOfFameUnavailable extends Error {}

/** The company's hall of fame and the viewer's own trophies. */
export async function getHallOfFame(viewerId: string): Promise<HallOfFameModel> {
  const db = await createClient();
  const { data, error } = await db.rpc('recognition_points', { p_employee: viewerId });
  if (error) {
    if (isMissingSchemaError(error.message)) throw new HallOfFameUnavailable('Hall of fame needs migration 50.');
    throw new Error(`Hall of fame read failed: ${error.message}`);
  }
  const payload = data as unknown as PointsPayload;
  const points = parseRecognitionPolicy({ points: payload.policy }).points;
  const entries = rankHall(payload.members, points);
  const mine = entries.find((e) => e.userId === viewerId);
  return {
    policy: points,
    entries,
    viewer: mine ? { ...mine, progress: tierFor(mine.points) } : null,
    recent: (payload.entries ?? []).slice(0, 12),
  };
}
