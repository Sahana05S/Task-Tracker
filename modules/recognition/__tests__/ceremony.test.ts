import { describe, expect, it } from 'vitest';
import { monthlyStarAct, projectCategories, selectCategoryWinners } from '@/modules/recognition/client';
import {
  calculatePerformance, FACTORS, measuredRaw, PERFORMANCE_RULE_VERSION, selectMonthly, unavailableRaw,
  type CalculationContext, type EffectiveAwardDay, type MemberRawInputs,
} from '@/modules/scoring/client';

const ctx = (ids: string[]): CalculationContext => ({
  ruleVersion: PERFORMANCE_RULE_VERSION, periodStart: '2026-09-01', periodEndExclusive: '2026-10-01', asOf: '2026-10-21T10:00:00+05:30',
  asOfLocalDate: '2026-10-21', timezone: 'Asia/Kolkata', attributionPolicy: 'normalized_shares', sourceWatermark: 'fixture', precisionPolicy: 'exact',
  displayPlaces: 2, factorDisplayPlaces: 6,
  windows: Object.fromEntries(FACTORS.map((f) => [f, 'fixture'])) as CalculationContext['windows'],
  cohorts: Object.fromEntries(FACTORS.map((f) => [f, { id: `fixture-${f}`, memberIds: ids, missingPolicy: 'exclude_unavailable', includeObservedZero: true }])) as CalculationContext['cohorts'],
});
const member = (id: string, values: Partial<Record<(typeof FACTORS)[number], string>>, eligibility: string[] = []): MemberRawInputs => ({
  userId: id, eligibilityReasons: eligibility,
  factors: Object.fromEntries(FACTORS.map((f) => [f, measuredRaw(values[f] ?? '0')])) as MemberRawInputs['factors'],
});

// The fixture month the migration-50 harness publishes too (tools/test_m16_database.py):
// productivity a=3 b=2 -> a; ideas a=2 c=2 -> tie; facts all 0 -> no one eligible;
// loading b=0.9 but b's attendance is invalid -> c=0.5; sales not mapped -> unavailable.
function fixtureMonth() {
  const inputs = [
    member('a', { productivity: '3', ideas: '2', loading: '0.4', progress: '10' }),
    member('b', { productivity: '2', ideas: '1', loading: '0.9', progress: '30' }, ['attendance_invalid']),
    member('c', { productivity: '1', ideas: '2', loading: '0.5', progress: '20' }),
  ].map((m) => ({ ...m, factors: { ...m.factors, sales: unavailableRaw('sales_field_mapping_missing') } }));
  return calculatePerformance(ctx(['a', 'b', 'c']), inputs);
}

describe('selectCategoryWinners (one award per factor, from the shared calculation)', () => {
  const byCategory = () => Object.fromEntries(selectCategoryWinners(fixtureMonth()).map((c) => [c.category, c]));

  it('gives ten categories in factor order', () => {
    expect(selectCategoryWinners(fixtureMonth()).map((c) => c.category)).toEqual([...FACTORS]);
  });

  it('awards the highest raw value', () => {
    expect(byCategory().productivity).toMatchObject({ status: 'awarded', winnerId: 'a', winningRaw: { numerator: '3', denominator: '1' } });
  });

  it('gives no award on an exact tie at the top (M08 rule) and names the tied members', () => {
    expect(byCategory().ideas).toMatchObject({ status: 'tie', winnerId: null, tiedIds: ['a', 'c'] });
  });

  it('skips members with an attendance eligibility reason', () => {
    expect(byCategory().loading).toMatchObject({ status: 'awarded', winnerId: 'c' });
    expect(byCategory().progress).toMatchObject({ status: 'awarded', winnerId: 'c' });
  });

  it('needs a value above zero', () => {
    expect(byCategory().facts).toMatchObject({ status: 'no_eligible', winnerId: null, reasons: [] });
  });

  it('marks a factor nobody has as unavailable, with the reasons', () => {
    expect(byCategory().sales).toMatchObject({ status: 'unavailable', winnerId: null, reasons: expect.arrayContaining(['sales_field_mapping_missing']) });
  });

  it('does not round before comparing', () => {
    const calc = calculatePerformance(ctx(['a', 'b']), [member('a', { ideas: '0.001' }), member('b', { ideas: '0.0011' })]);
    expect(selectCategoryWinners(calc).find((c) => c.category === 'ideas')?.winnerId).toBe('b');
  });
});

describe('projectCategories (winning values for the winner and managers only)', () => {
  it('hides other winners\' values from a member', () => {
    const shown = Object.fromEntries(projectCategories(selectCategoryWinners(fixtureMonth()), 'c', false).map((c) => [c.category, c.winningRaw]));
    expect(shown.loading).toEqual({ numerator: '1', denominator: '2' });
    expect(shown.productivity).toBeNull();
    expect(shown.ideas).toBeNull();
  });

  it('shows every value to a manager', () => {
    expect(projectCategories(selectCategoryWinners(fixtureMonth()), 'm', true).find((c) => c.category === 'ideas')?.winningRaw).not.toBeNull();
  });
});

describe('monthlyStarAct (the live monthly winner from scoring)', () => {
  const days = (wins: string[]): EffectiveAwardDay[] => wins.map((w, i) => ({
    date: `2026-09-${String(i + 1).padStart(2, '0')}`, status: w ? 'completed_winner' : 'completed_none', winnerId: w || null, certified: true,
  }));
  const calc = calculatePerformance(ctx(['a', 'b']), [member('a', { ideas: '2' }), member('b', { ideas: '1' })]);

  it('names the member with most certified daily stars', () => {
    const ds = days(['a', 'a', 'b', '']);
    const act = monthlyStarAct(selectMonthly(ds, ds.map((d) => d.date), calc, undefined, true));
    expect(act).toMatchObject({ status: 'winner', winnerId: 'a', counts: { a: 2, b: 1 } });
  });

  it('stays pending while a day is undecided', () => {
    const ds = days(['a', 'b']);
    const act = monthlyStarAct(selectMonthly(ds, [...ds.map((d) => d.date), '2026-09-03'], calc, undefined, true));
    expect(act).toMatchObject({ status: 'pending', winnerId: null, reasons: ['daily_coverage_incomplete'] });
  });

  it('is decided without a star when no one won a day', () => {
    const ds = days(['', '']);
    expect(monthlyStarAct(selectMonthly(ds, ds.map((d) => d.date), calc, undefined, true)).status).toBe('no_winner');
  });
});
