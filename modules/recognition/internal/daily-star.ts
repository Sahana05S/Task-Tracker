// PRIVATE. Server-side daily star read: yesterday's award day from the M08
// award read model (owned by scoring), mapped by the pure rule. No selection
// logic lives here.
import { readTeamAwardModel } from '@/modules/scoring';
import type { AwardReadModel } from '@/modules/scoring/client';
import { kolkataDate } from '@/shared/time/kolkata';

import { dailyStarHighlight, type DailyStarHighlight } from './rules';

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Yesterday's daily star (Asia/Kolkata) as the viewer sees it. Throws when the
 * award read model is unavailable so the page can say so; it never returns a
 * zero or an invented outcome.
 */
export async function getDailyStarHighlight(userId: string, now = new Date()): Promise<DailyStarHighlight> {
  const today = kolkataDate(now);
  const yesterday = addDays(today, -1);
  const model = (await readTeamAwardModel(yesterday, today)) as Pick<AwardReadModel, 'days' | 'policy' | 'policyApproved'> | null;
  if (!model || !Array.isArray(model.days)) throw new Error('Award read model unavailable.');
  return dailyStarHighlight(
    { days: model.days, policyApproved: model.policyApproved, policy: model.policy as DailyStarSourcePolicy },
    yesterday,
    userId,
  );
}

type DailyStarSourcePolicy = { cutoffHour?: unknown; cutoffMinute?: unknown } | null;
