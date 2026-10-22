import { describe, expect, it } from 'vitest';

import { groupByMember } from '@/modules/policies/internal/ceremony';
import type { CommendationRow } from '@/modules/policies/internal/queries';

const row = (employeeId: string, name: string, policyId: string, points: number, periodKey = '2026-W42'): CommendationRow => ({
  policyId, policyName: `Policy ${policyId}`, badge: `Badge ${policyId}`, points, periodKind: 'week', periodKey,
  periodStart: '2026-10-12', periodEnd: '2026-10-18', employeeId, name, commendedAt: '2026-10-19T00:30:00Z',
});

describe('ceremony commendations', () => {
  it('groups by member, sums points and puts the most points first', () => {
    const grouped = groupByMember([row('b', 'Bala', 'p1', 10), row('a', 'Asha', 'p1', 10), row('a', 'Asha', 'p2', 0), row('c', 'Chitra', 'p3', 25)]);
    expect(grouped.map((m) => [m.name, m.points, m.commendations.length])).toEqual([['Chitra', 25, 1], ['Asha', 10, 2], ['Bala', 10, 1]]);
    expect(Object.keys(grouped[0].commendations[0]).sort()).toEqual(['badge', 'periodEnd', 'periodKey', 'periodKind', 'periodStart', 'points', 'policyId', 'policyName']);
  });

  it('is empty without commendations', () => {
    expect(groupByMember([])).toEqual([]);
  });
});
