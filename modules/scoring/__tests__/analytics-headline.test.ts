import { describe, expect, it } from 'vitest';

import { resolvePeriod, type MemberPerformance, type TeamAnalytics } from '@/modules/scoring/internal/analytics/engine';
import { computeMissionHeadline, leaderBy, productivityBand, progressBand, spreadBand } from '@/modules/scoring/internal/analytics/headline';
import type { Task } from '@/types/tracker';

const OCT = resolvePeriod(2026, 10);

const task = (id: string, fields: Partial<Task>): Task =>
  ({ id, archivedEffectiveDate: null, status: 'In Progress', assignedDate: '2026-10-01', completedDate: null, progressPercentage: null, taskProductivity: null, ...fields }) as Task;
const member = (fullName: string, fields: Partial<MemberPerformance>): MemberPerformance =>
  ({ fullName, criticalityScore: null, productivity: null, loadingDiff: null, ...fields }) as MemberPerformance;
const analytics = (members: MemberPerformance[], allocationSpread: number): TeamAnalytics =>
  ({ members, totals: { allocationSpread } }) as unknown as TeamAnalytics;

describe('Missions headline strip', () => {
  it('colours figures with the approved red/amber/green cut-offs', () => {
    expect([5, 5.01, 7, 7.01, 15.09].map(spreadBand)).toEqual(['green', 'amber', 'amber', 'red', 'red']);
    expect([3.99, 4, 6.99, 7, 9.43].map(productivityBand)).toEqual(['red', 'amber', 'amber', 'green', 'green']);
    expect([20.17, 49.99, 50, 74.99, 75, 100].map(progressBand)).toEqual(['red', 'red', 'amber', 'amber', 'green', 'green']);
  });

  it('names a single leader, names nobody on a tie, and is unavailable without values', () => {
    expect(leaderBy([member('A', { criticalityScore: 3.75 }), member('B', { criticalityScore: 1 })], m => m.criticalityScore))
      .toEqual({ name: 'A', value: 3.75, reason: 'available' });
    expect(leaderBy([member('A', { loadingDiff: 7.55 }), member('B', { loadingDiff: 7.55 })], m => m.loadingDiff))
      .toEqual({ name: null, value: 7.55, reason: 'tie' });
    expect(leaderBy([member('A', {}), member('B', {})], m => m.productivity)).toEqual({ name: null, value: null, reason: 'unavailable' });
  });

  it('averages the month\'s tracked tasks, excluding archived, discarded and untracked work', () => {
    const tasks = [
      task('t1', { progressPercentage: 20, taskProductivity: 9 }),
      task('t2', { progressPercentage: 40, taskProductivity: 3 }),
      task('t3', { progressPercentage: 90, taskProductivity: 50 }),
      task('archived', { progressPercentage: 100, taskProductivity: 100, archivedEffectiveDate: '2026-10-05' }),
      task('discarded', { progressPercentage: 100, taskProductivity: 100, status: 'Discarded' }),
      task('future', { progressPercentage: 100, taskProductivity: 100, assignedDate: '2026-11-02' }),
      task('finished-before', { progressPercentage: 100, taskProductivity: 100, status: 'Done', completedDate: '2026-09-20' }),
      task('no-progress', {}),
    ];
    const hours = new Map([['t1', 2], ['t2', 1], ['t3', 0], ['archived', 5], ['discarded', 5], ['future', 5], ['finished-before', 5]]);
    const headline = computeMissionHeadline({
      analytics: analytics([member('A', { criticalityScore: 2, productivity: 9.4, loadingDiff: 4 }), member('B', { criticalityScore: 1, productivity: 2, loadingDiff: -4 })], 15.09),
      tasks,
      period: OCT,
      hoursByTask: hours,
    });
    expect(headline.averageProgress).toEqual({ value: 50, band: 'amber', taskCount: 3 });
    // t3 has no logged hours, so only t1 and t2 count toward productivity.
    expect(headline.averageProductivity).toEqual({ value: 6, band: 'amber', taskCount: 2 });
    expect(headline.allocationSpread).toEqual({ value: 15.09, band: 'red' });
    expect([headline.critical.name, headline.productive.name, headline.loaded.name]).toEqual(['A', 'A', 'A']);
  });

  it('reports everything unavailable when analytics cannot be loaded', () => {
    const headline = computeMissionHeadline({ analytics: null, tasks: [], period: OCT, hoursByTask: new Map() });
    expect(headline.critical.reason).toBe('unavailable');
    expect(headline.allocationSpread).toEqual({ value: null, band: null });
    expect(headline.averageProgress).toEqual({ value: null, band: null, taskCount: 0 });
  });
});
