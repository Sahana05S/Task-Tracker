import { describe, expect, it } from 'vitest';

import { financialYearLabel, financialYearOf, salaryTrend, shortMonthLabel } from '@/modules/payroll/client';
import { mapSalaryHistory } from '@/modules/payroll/internal/trend';

const month = (period: string, monthlySalary: number, inHand: number, incentives: { name: string; amount: number }[], fixed = 500, variable = 0) => ({
  period, daysWorked: 24, monthlySalary, calculated: monthlySalary, capped: monthlySalary,
  fixedTotal: fixed, variableTotal: variable, incentiveTotal: incentives.reduce((sum, item) => sum + item.amount, 0),
  deductions: fixed + variable - incentives.reduce((sum, item) => sum + item.amount, 0), inHand, advanceBalance: 0,
  breakdown: { fixed: [{ name: 'Provident Fund', amount: fixed }], variable: [], incentives },
});

// Hand-worked: salary 20,000 from Feb 2026, 22,000 from Jul 2026, 25,300 from Jan 2027.
const history = mapSalaryHistory({
  userId: 'u1',
  months: [
    month('2026-03-01', 20000, 19500, []),
    month('2026-07-01', 22000, 23000, [{ name: 'Bonus', amount: 1000 }, { name: 'Star Performer', amount: 500 }]),
    month('2026-04-01', 20000, 20250.5, [{ name: 'Bonus', amount: 750.25 }]),
    month('2026-09-01', 22000, 21800, [], 500, 200),
  ],
  revisions: [
    { effectiveFrom: '2026-07-01', monthlySalary: 22000 },
    { effectiveFrom: '2026-02-01', monthlySalary: 20000 },
    { effectiveFrom: '2027-01-01', monthlySalary: 25300 },
  ],
});

describe('salary trend', () => {
  it('orders the months and labels them for the axis', () => {
    const trend = salaryTrend(history, '2026-10-01');
    expect(shortMonthLabel('2026-03-01')).toBe('Mar 26');
    expect(trend.points[0].label).toBe('Mar 26');
    expect(trend.points.map(point => point.period)).toEqual(['2026-03-01', '2026-04-01', '2026-07-01', '2026-09-01']);
    expect(trend.points[2]).toMatchObject({ monthlySalary: 22000, inHand: 23000, incentives: 1500, deductions: 500 });
    expect(trend.points[3].deductions).toBe(700);
  });

  it('lists each increment against the salary before it', () => {
    const trend = salaryTrend(history, '2027-02-01');
    expect(trend.increments).toEqual([
      { effectiveFrom: '2026-02-01', from: null, to: 20000, change: null, percent: null },
      { effectiveFrom: '2026-07-01', from: 20000, to: 22000, change: 2000, percent: 10 },
      { effectiveFrom: '2027-01-01', from: 22000, to: 25300, change: 3300, percent: 15 },
    ]);
    expect(trend.currentSalary).toBe(25300);
    expect(trend.growth).toEqual({ change: 5300, percent: 26.5 });
  });

  it('ignores a revision that has not started yet', () => {
    const trend = salaryTrend(history, '2026-10-01');
    expect(trend.currentSalary).toBe(22000);
    expect(trend.growth).toEqual({ change: 2000, percent: 10 });
  });

  it('totals April to March, newest year first, incentives by name', () => {
    const [current, previous] = salaryTrend(history, '2026-10-01').years;
    expect(current).toEqual({
      label: 'FY 2026-27', startYear: 2026, months: 3,
      inHand: 65050.5, incentives: 2250.25, deductions: 1700,
      incentivesByName: [{ name: 'Bonus', amount: 1750.25 }, { name: 'Star Performer', amount: 500 }],
    });
    expect(previous).toMatchObject({ label: 'FY 2025-26', months: 1, inHand: 19500, incentives: 0, incentivesByName: [] });
  });

  it('places January to March in the year that began the April before', () => {
    expect(financialYearOf('2027-03-01')).toBe(2026);
    expect(financialYearOf('2026-04-01')).toBe(2026);
    expect(financialYearLabel(2099)).toBe('FY 2099-00');
  });

  it('copes with no salary and no months', () => {
    const trend = salaryTrend(mapSalaryHistory({ userId: 'u2' }), '2026-10-01');
    expect(trend).toEqual({ points: [], increments: [], currentSalary: null, growth: null, years: [] });
  });
});
