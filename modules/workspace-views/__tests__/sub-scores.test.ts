import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  APPROVED_PERFORMANCE_POLICY,
  calculatePerformance,
  FACTORS,
  measuredRaw,
  PERFORMANCE_RULE_VERSION,
  unavailableRaw,
  type CalculationContext,
  type Factor,
} from '@/modules/scoring/client';
import { FactorDifferentialsChart } from '@/modules/workspace-views/components/dashboard/factor-differentials-chart';
import { SubScoresGrid } from '@/modules/workspace-views/components/dashboard/sub-scores-grid';

const A = 'a0000000-0000-4000-8000-000000000001';
const B = 'b0000000-0000-4000-8000-000000000002';
const C = 'c0000000-0000-4000-8000-000000000003';

/** Three members through the real engine; sales has no source for anyone. */
function calculation() {
  const all = Object.fromEntries(FACTORS.map((f) => [f, 'approved'])) as Record<Factor, string>;
  const context: CalculationContext = {
    ruleVersion: PERFORMANCE_RULE_VERSION, periodStart: '2026-10-01', periodEndExclusive: '2026-11-01', asOf: '2026-10-21T12:00:00Z',
    asOfLocalDate: '2026-10-21', timezone: 'Asia/Kolkata', windows: all,
    cohorts: Object.fromEntries(FACTORS.map((f) => [f, { id: f, memberIds: [A, B, C], missingPolicy: 'exclude_unavailable', includeObservedZero: true }])) as CalculationContext['cohorts'],
    attributionPolicy: 'approved', sourceWatermark: 'w', precisionPolicy: APPROVED_PERFORMANCE_POLICY.precisionPolicy ?? 'approved', displayPlaces: 2,
  };
  const raw = (values: Partial<Record<Factor, string>>) => Object.fromEntries(FACTORS.map((f) => [
    f, f === 'sales' ? unavailableRaw('sales_flags_missing') : measuredRaw(values[f] ?? '1'),
  ])) as Record<Factor, ReturnType<typeof measuredRaw>>;
  return calculatePerformance(context, [
    { userId: A, factors: raw({ productivity: '3' }), eligibilityReasons: [] },
    { userId: B, factors: raw({ productivity: '1' }), eligibilityReasons: [] },
    { userId: C, factors: raw({ productivity: '2' }), eligibilityReasons: [] },
  ]);
}

const names = { [A]: 'Zoya', [B]: 'Arun', [C]: 'Meera' };

describe('SubScoresGrid', () => {
  const html = renderToStaticMarkup(createElement(SubScoresGrid, { calculation: calculation(), names }));

  it('renders the ten factors in engine order', () => {
    const titles = [...html.matchAll(/<h3[^>]*>([^<]+)<\/h3>/g)].map((m) => m[1]);
    expect(titles).toEqual(['Productivity', 'Criticality', 'Loading', 'Completion', 'Progress', 'Sales', 'Facts', 'Ideas', 'Suggestions', 'Freshness']);
  });

  it('draws members in the same order with signed six-decimal differences', () => {
    const productivity = html.slice(html.indexOf('>Productivity<'), html.indexOf('>Criticality<'));
    expect([...productivity.matchAll(/title="([^"]+)"/g)].map((m) => m[1])).toEqual(['Arun', 'Meera', 'Zoya']);
    expect(productivity).toContain('−1.000000');
    expect(productivity).toMatch(/>0.000000</);
    expect(productivity).toContain('+1.000000');
    expect(productivity).toContain('Team median 2.000000');
  });

  it("shows the engine's reasons for an unavailable factor, never zeros", () => {
    const sales = html.slice(html.indexOf('>Sales<'), html.indexOf('>Facts<'));
    expect(sales).toContain('Not available for this period');
    expect(sales).toContain('A sales entry is missing its project flags');
    expect(sales).toContain('sales_flags_missing');
    expect(sales).not.toContain('0.000000');
    expect(sales).not.toContain('<li class="grid');
  });

  it('shows a member only their own bars against the team median', () => {
    const own = renderToStaticMarkup(createElement(SubScoresGrid, { calculation: calculation(), names, onlyUserId: C }));
    expect(own).toContain('Meera');
    expect(own).not.toContain('Zoya');
    expect(own).not.toContain('Arun');
    expect(own).toContain('Team median 2.000000');
  });

  it('shows an empty state when nothing is calculated', () => {
    expect(renderToStaticMarkup(createElement(SubScoresGrid, { calculation: null, names }))).toContain('No performance has been calculated');
  });
});

describe('FactorDifferentialsChart', () => {
  it('counts members without a difference instead of drawing them', () => {
    const html = renderToStaticMarkup(createElement(FactorDifferentialsChart, {
      title: 'Loading', unit: 'fraction 0-1', median: '0.5',
      members: [{ userId: A, fullName: 'Zoya', delta: '0.25' }, { userId: B, fullName: 'Arun', delta: null }],
    }));
    expect(html).toContain('+0.250000');
    expect(html).not.toContain('Arun');
    expect(html).toContain('1 not compared');
  });
});
