import { describe, expect, it } from 'vitest';
import { buildLeaderboard, parseBoardKey, podiumSteps, rankExact } from '@/modules/recognition/client';
import {
  calculatePerformance, FACTORS, measuredRaw, PERFORMANCE_RULE_VERSION, unavailableRaw,
  type CalculationContext, type MemberRawInputs,
} from '@/modules/scoring/client';

// Fixtures follow modules/scoring/__tests__/stars-awards.test.ts: every factor
// in one cohort, observed zero included, exact precision.
const ctx = (ids: string[]): CalculationContext => ({
  ruleVersion: PERFORMANCE_RULE_VERSION, periodStart: '2026-10-01', periodEndExclusive: '2026-11-01', asOf: '2026-10-21T10:00:00+05:30',
  asOfLocalDate: '2026-10-21', timezone: 'Asia/Kolkata', attributionPolicy: 'normalized_shares', sourceWatermark: 'fixture', precisionPolicy: 'exact',
  displayPlaces: 2, factorDisplayPlaces: 6,
  windows: Object.fromEntries(FACTORS.map((f) => [f, 'fixture'])) as CalculationContext['windows'],
  cohorts: Object.fromEntries(FACTORS.map((f) => [f, { id: `fixture-${f}`, memberIds: ids, missingPolicy: 'exclude_unavailable', includeObservedZero: true }])) as CalculationContext['cohorts'],
});
const member = (id: string, values: Partial<Record<(typeof FACTORS)[number], string>> = {}, eligibilityReasons: string[] = []): MemberRawInputs => ({
  userId: id, eligibilityReasons,
  factors: Object.fromEntries(FACTORS.map((f) => [f, measuredRaw(values[f] ?? '0')])) as MemberRawInputs['factors'],
});
const everyone = () => true;

describe('rankExact (competition ranking on exact values)', () => {
  it('shares a rank on an exact tie and skips the next (1, 1, 3)', () => {
    const ranks = rankExact([{ id: 'a', v: '2' }, { id: 'b', v: '5' }, { id: 'c', v: '5' }], (x) => ({ numerator: x.v, denominator: '1' }));
    expect(ranks.map((r) => [r.item.id, r.rank])).toEqual([['b', 1], ['c', 1], ['a', 3]]);
  });

  it('does not round before comparing (0.01 vs 0.02 rank apart)', () => {
    const ranks = rankExact(['0.01', '0.02'], (v) => ({ numerator: v.replace('0.0', ''), denominator: '100' }));
    expect(ranks.map((r) => [r.item, r.rank])).toEqual([['0.02', 1], ['0.01', 2]]);
  });
});

describe('buildLeaderboard (shared engine projected to ranks)', () => {
  it('ranks the composite for eligible complete members with two-decimal scores', () => {
    const calc = calculatePerformance(ctx(['a', 'b', 'c']), [member('a', { progress: '80' }), member('b'), member('c', { progress: '160' })]);
    const board = buildLeaderboard(calc, everyone).boards.composite;
    expect(board.status).toBe('ready');
    expect(board.rows.map((r) => [r.userId, r.rank, r.value])).toEqual([['c', 1, '1.00'], ['a', 2, '0.00'], ['b', 3, '-1.00']]);
  });

  it('gives every factor its own tab ranked by the raw value', () => {
    const calc = calculatePerformance(ctx(['a', 'b', 'c']), [member('a', { ideas: '3' }), member('b', { ideas: '7' }), member('c', { ideas: '3' })]);
    const model = buildLeaderboard(calc, everyone);
    expect(Object.keys(model.boards)).toEqual(['composite', ...FACTORS]);
    expect(model.boards.ideas.rows.map((r) => [r.userId, r.rank])).toEqual([['b', 1], ['a', 2], ['c', 2]]);
    expect(model.boards.ideas.rows[0]).toMatchObject({ value: '7.000000', delta: '4.000000' });
  });

  it('hides other members\' factor values and reasons from a member, but not their rank', () => {
    const inputs = [member('a', { facts: '2' }), member('b', { facts: '4' }), member('c', {}, ['attendance_invalid'])];
    const model = buildLeaderboard(calculatePerformance(ctx(['a', 'b', 'c']), inputs), (id) => id === 'a');
    expect(model.boards.facts.rows).toEqual([
      { userId: 'b', rank: 1, value: null, delta: null },
      { userId: 'a', rank: 2, value: '2.000000', delta: '0.000000' },
    ]);
    expect(model.boards.composite.rows.find((r) => r.userId === 'b')?.value).not.toBeNull();
    expect(model.boards.facts.unranked).toEqual([{ userId: 'c', reasons: [] }]);
  });

  it('leaves members with attendance eligibility reasons unranked everywhere, with reasons for managers', () => {
    const inputs = [member('a', { loading: '0.5' }), member('b', { loading: '0.9' }, ['attendance_unavailable'])];
    const model = buildLeaderboard(calculatePerformance(ctx(['a', 'b']), inputs), everyone);
    expect(model.boards.loading.rows.map((r) => r.userId)).toEqual(['a']);
    expect(model.boards.loading.unranked).toEqual([{ userId: 'b', reasons: ['attendance_unavailable'] }]);
    expect(model.boards.composite.rows.map((r) => r.userId)).toEqual(['a']);
  });

  it('locks the sales tab and the composite only when the sales mapping is missing (pre-46 fallback)', () => {
    const inputs = ['a', 'b'].map((id) => ({ ...member(id), factors: { ...member(id).factors, sales: unavailableRaw('sales_field_mapping_missing') } }));
    const model = buildLeaderboard(calculatePerformance(ctx(['a', 'b']), inputs), everyone);
    expect(model.boards.sales).toMatchObject({ status: 'locked', rows: [] });
    expect(model.boards.composite.status).toBe('locked');
    expect(model.boards.composite.reasons).toContain('sales:sales_field_mapping_missing');
    expect(model.boards.facts.status).toBe('ready');
  });

  it('marks a board unavailable (not locked) for any other missing source', () => {
    const inputs = ['a', 'b'].map((id) => ({ ...member(id), factors: { ...member(id).factors, freshness: unavailableRaw('task_history_before_observed_baseline') } }));
    const model = buildLeaderboard(calculatePerformance(ctx(['a', 'b']), inputs), everyone);
    expect(model.boards.freshness).toMatchObject({ status: 'unavailable', reasons: expect.arrayContaining(['task_history_before_observed_baseline']) });
    expect(model.boards.composite.status).toBe('unavailable');
  });

  it('handles an empty population and a single member', () => {
    expect(buildLeaderboard(calculatePerformance(ctx([]), []), everyone).boards.composite).toMatchObject({ status: 'unavailable', rows: [] });
    const solo = buildLeaderboard(calculatePerformance(ctx(['a']), [member('a')]), everyone);
    expect(solo.boards.composite.rows).toEqual([{ userId: 'a', rank: 1, value: '0.00', delta: null }]);
  });
});

describe('podium and tab parsing', () => {
  it('stacks shared ranks on one step and skips an empty second step', () => {
    const steps = podiumSteps([
      { userId: 'a', rank: 1, value: null, delta: null }, { userId: 'b', rank: 1, value: null, delta: null },
      { userId: 'c', rank: 3, value: null, delta: null }, { userId: 'd', rank: 4, value: null, delta: null },
    ]);
    expect(steps.map((s) => [s.rank, s.rows.map((r) => r.userId)])).toEqual([[1, ['a', 'b']], [3, ['c']]]);
  });

  it('falls back to the composite board for unknown tabs', () => {
    expect(parseBoardKey('ideas')).toBe('ideas');
    expect(parseBoardKey('drop table')).toBe('composite');
    expect(parseBoardKey(undefined)).toBe('composite');
  });
});
