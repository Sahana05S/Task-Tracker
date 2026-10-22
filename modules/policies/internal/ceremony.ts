// PRIVATE. Commendations for the monthly ceremony and the hall of fame. Read
// on their own so the recognition module never imports policies; the pages
// pass them in. Points are recognition only and never feed a score.
import { createClient } from '@/shared/supabase/server';

import { addDays } from './periods';
import { readCommendations, type CommendationRow } from './queries';

export interface MemberCommendations {
  employeeId: string;
  name: string;
  points: number;
  commendations: Pick<CommendationRow, 'policyId' | 'policyName' | 'badge' | 'points' | 'periodKind' | 'periodKey' | 'periodStart' | 'periodEnd'>[];
}

/** Commendations whose period ended in [periodStart, periodEndExclusive), grouped by member (most points first). */
export async function getCeremonyCommendations(periodStart: string, periodEndExclusive: string): Promise<MemberCommendations[]> {
  const rows = await readCommendations(await createClient(), { from: periodStart, to: addDays(periodEndExclusive, -1) });
  return groupByMember(rows);
}

export function groupByMember(rows: readonly CommendationRow[]): MemberCommendations[] {
  const byMember = new Map<string, MemberCommendations>();
  for (const row of rows) {
    const entry = byMember.get(row.employeeId) ?? { employeeId: row.employeeId, name: row.name, points: 0, commendations: [] };
    entry.points += row.points;
    entry.commendations.push({ policyId: row.policyId, policyName: row.policyName, badge: row.badge, points: row.points,
      periodKind: row.periodKind, periodKey: row.periodKey, periodStart: row.periodStart, periodEnd: row.periodEnd });
    byMember.set(row.employeeId, entry);
  }
  return [...byMember.values()].sort((a, b) => b.points - a.points || b.commendations.length - a.commendations.length || a.name.localeCompare(b.name));
}

/** All-time commendation points and counts per member, for the hall of fame. */
export async function getCommendationTotals(): Promise<Record<string, { points: number; commendations: number }>> {
  const rows = await readCommendations(await createClient());
  const totals: Record<string, { points: number; commendations: number }> = {};
  for (const row of rows) {
    const t = (totals[row.employeeId] ??= { points: 0, commendations: 0 });
    t.points += row.points;
    t.commendations += 1;
  }
  return totals;
}
