import { describe, expect, it } from 'vitest';

import { dailyPerfCsv, dailyPerfFilter, dailyPerfRows } from '@/modules/reports/client';
import { FACTORS, type Factor, type FactorResult, type MemberCalculation } from '@/modules/scoring/client';
import { Exact } from '@/shared/math/exact';

const ASHA = '11111111-1111-4111-8111-111111111111';
const RAVI = '22222222-2222-4222-8222-222222222222';
const MANAGER = { id: '33333333-3333-4333-8333-333333333333', role: 'managing_director' as const };

function factor(delta: string | null): FactorResult {
  const exact = delta === null ? null : Exact.from(delta).json();
  return {
    unit: 'u', rawValue: null, rawExact: null, available: delta !== null, reasons: delta === null ? ['raw_input_unavailable'] : [], sources: [],
    cohortId: 'c', population: [], excludedPopulation: [], median: 0, medianExact: Exact.from(0).json(),
    delta: delta === null ? null : Number(delta), deltaExact: exact, coefficient: '1', contribution: null, contributionExact: null,
  };
}

function calc(userId: string, deltas: Partial<Record<Factor, string | null>>, composite: string | null): MemberCalculation {
  return {
    userId, status: composite === null ? 'incomplete' : 'complete',
    factors: Object.fromEntries(FACTORS.map((f) => [f, factor(f in deltas ? deltas[f]! : '0')])) as Record<Factor, FactorResult>,
    composite: composite === null ? null : Number(composite), compositeExact: composite === null ? null : Exact.from(composite).json(),
    knownSubtotal: 0, knownSubtotalExact: Exact.from(0).json(), subtotalLabel: 'Available-factor subtotal', reasons: [], eligibleForRanking: composite !== null,
  };
}

describe('daily perf log rows', () => {
  // 1-3 October: a certified run on the 1st, an uncertified (stale) run on the 3rd, no run on the 2nd.
  const days = [
    { date: '2026-10-01', certified: true, candidates: [
      { userId: ASHA, calculation: calc(ASHA, { productivity: '0.1234565' }, '1.005') },
      { userId: RAVI, calculation: calc(RAVI, { productivity: '-0.5', sales: null }, null) },
    ] },
    { date: '2026-10-03', certified: false, candidates: [{ userId: ASHA, calculation: calc(ASHA, {}, '-2') }] },
  ];
  const hours = new Map([[`${ASHA}|2026-10-01`, Exact.from('2.5').add(Exact.from('1.25'))]]);
  const rows = dailyPerfRows({ from: '2026-10-01', to: '2026-10-03', members: [{ id: RAVI, fullName: 'Ravi' }, { id: ASHA, fullName: 'Asha' }], days, hours });

  it('gives one row per member per day, newest day first, members by name', () => {
    expect(rows.map((row) => `${row.date} ${row.fullName}`)).toEqual([
      '2026-10-03 Asha', '2026-10-03 Ravi', '2026-10-02 Asha', '2026-10-02 Ravi', '2026-10-01 Asha', '2026-10-01 Ravi',
    ]);
  });

  it('marks a stale day that keeps its last decided result as recalculating (migration 62)', () => {
    const stale = [{ date: '2026-10-01', certified: false, status: 'stale' as const, lastDecided: { status: 'completed_winner' as const, winnerId: ASHA, runId: 'r', decidedAt: null, override: false },
      candidates: [{ userId: ASHA, calculation: calc(ASHA, {}, '3') }] }];
    const [row] = dailyPerfRows({ from: '2026-10-01', to: '2026-10-01', members: [{ id: ASHA, fullName: 'Asha' }], days: stale, hours: new Map() });
    expect(row.status).toBe('recalculating');
    expect(row.sum).toBe('3.00');
  });

  it('marks the gap day not calculated, uncertified runs, and members missing from a run', () => {
    expect(rows.map((row) => row.status)).toEqual(['uncertified', 'not_calculated', 'not_calculated', 'not_calculated', 'calculated', 'calculated']);
    expect(rows[2].factors.productivity).toBeNull();
    expect(rows[2].sum).toBeNull();
  });

  it('shows six-decimal differences, a two-decimal Sum and summed hours', () => {
    const asha = rows[4];
    expect(asha.factors.productivity).toBe('0.123457');
    expect(asha.sum).toBe('1.01');
    expect(asha.hours).toBe('3.75');
    expect(rows[0].sum).toBe('-2.00');
    expect(rows[5].factors.productivity).toBe('-0.500000');
    expect(rows[5].factors.sales).toBeNull();
    expect(rows[5].sum).toBeNull();
    expect(rows[5].hours).toBe('0.00');
  });

  it('writes the CSV header and keeps unavailable distinct from not calculated', () => {
    const csv = dailyPerfCsv(rows).split('\r\n');
    expect(csv[0]).toBe([
      'Date', 'Member', ...FACTORS.map((f) => `${f[0].toUpperCase()}${f.slice(1)} (difference from median)`), 'Sum', 'Hours logged', 'Status',
    ].map((cell) => `"${cell}"`).join(','));
    expect(csv).toHaveLength(7);
    expect(csv[2]).toBe(`"2026-10-03","Ravi",${Array(11).fill('""').join(',')},"0.00","Not calculated"`);
    expect(csv[6]).toContain('"-0.500000"');
    expect(csv[6]).toContain('"Unavailable"');
    expect(csv[6]).toContain('"Incomplete"');
  });
});

describe('daily perf log filter', () => {
  const defaults = { from: '2026-10-01', to: '2026-10-21' };
  it('defaults to month to date and ignores bad dates', () => {
    expect(dailyPerfFilter({ from: '2026-02-30', to: 'x' }, defaults, MANAGER)).toEqual({ ...defaults, member: null });
  });
  it('swaps a reversed range and caps it at 92 days', () => {
    expect(dailyPerfFilter({ from: '2026-10-05', to: '2026-10-02' }, defaults, MANAGER)).toMatchObject({ from: '2026-10-02', to: '2026-10-05' });
    expect(dailyPerfFilter({ from: '2026-01-01', to: '2026-10-21' }, defaults, MANAGER)).toMatchObject({ from: '2026-07-22', to: '2026-10-21' });
  });
  it('lets managers pick a member and keeps members on themselves', () => {
    expect(dailyPerfFilter({ member: ASHA }, defaults, MANAGER).member).toBe(ASHA);
    expect(dailyPerfFilter({ member: 'not-a-uuid' }, defaults, MANAGER).member).toBeNull();
    expect(dailyPerfFilter({ member: RAVI }, defaults, { id: ASHA, role: 'team_member' as const }).member).toBe(ASHA);
    expect(dailyPerfFilter({}, defaults, { id: ASHA, role: 'team_member' as const }).member).toBe(ASHA);
  });
});
