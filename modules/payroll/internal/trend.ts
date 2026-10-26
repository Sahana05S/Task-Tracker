import type { PayItem } from './mappers';

/**
 * Salary history and its trend (M19, migration 79). PRIVATE; re-exported
 * through `client.ts`. The months are frozen finalised records, so this only
 * arranges and totals them: incentives are what the managing director
 * entered, never computed here.
 */

export interface SalaryMonth {
  period: string;
  daysWorked: number;
  monthlySalary: number | null;
  calculated: number | null;
  capped: number | null;
  fixedTotal: number;
  variableTotal: number;
  incentiveTotal: number;
  deductions: number;
  /** Rounded in-hand pay of the finalised month. */
  inHand: number | null;
  advanceBalance: number;
  breakdown: { fixed: PayItem[]; variable: PayItem[]; incentives: PayItem[] };
}

export interface SalaryHistory {
  userId: string;
  months: SalaryMonth[];
  revisions: { effectiveFrom: string; monthlySalary: number }[];
}

type Row = Record<string, unknown>;
const object = (value: unknown): Row => (typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Row : {});
const list = (value: unknown): Row[] => (Array.isArray(value) ? value.map(object) : []);
const num = (value: unknown): number => (value === null || value === undefined ? 0 : Number(value));
const maybe = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));
const items = (value: unknown): PayItem[] => list(value).map(item => ({ name: String(item.name ?? ''), amount: num(item.amount) }));

export function mapSalaryHistory(data: unknown): SalaryHistory {
  const value = object(data);
  return {
    userId: String(value.userId ?? ''),
    months: list(value.months).map(row => {
      const breakdown = object(row.breakdown);
      return {
        period: String(row.period),
        daysWorked: num(row.daysWorked),
        monthlySalary: maybe(row.monthlySalary),
        calculated: maybe(row.calculated),
        capped: maybe(row.capped),
        fixedTotal: num(row.fixedTotal),
        variableTotal: num(row.variableTotal),
        incentiveTotal: num(row.incentiveTotal),
        deductions: num(row.deductions),
        inHand: maybe(row.inHand),
        advanceBalance: num(row.advanceBalance),
        breakdown: { fixed: items(breakdown.fixed), variable: items(breakdown.variable), incentives: items(breakdown.incentives) },
      };
    }),
    revisions: list(value.revisions).map(row => ({ effectiveFrom: String(row.effectiveFrom), monthlySalary: num(row.monthlySalary) })),
  };
}

export interface TrendPoint {
  period: string;
  /** "Oct 26", for the chart's axis. */
  label: string;
  monthlySalary: number | null;
  inHand: number | null;
  incentives: number;
  /** Fixed and variable deductions (before incentives are taken off). */
  deductions: number;
}

export interface SalaryIncrement {
  effectiveFrom: string;
  from: number | null;
  to: number;
  /** Rupees; null for the first salary. */
  change: number | null;
  /** Percent of the previous salary, one decimal; null for the first salary or from zero. */
  percent: number | null;
}

export interface FinancialYearTotals {
  /** "FY 2026-27" (April to March). */
  label: string;
  startYear: number;
  months: number;
  inHand: number;
  incentives: number;
  deductions: number;
  incentivesByName: PayItem[];
}

export interface SalaryTrend {
  points: TrendPoint[];
  increments: SalaryIncrement[];
  /** The salary in effect for `asOfPeriod`; null when none has started. */
  currentSalary: number | null;
  /** Change from the first salary to the current one; null with fewer than two. */
  growth: { change: number; percent: number | null } | null;
  /** Newest first. */
  years: FinancialYearTotals[];
}

const money = (value: number): number => Math.round(value * 100) / 100;

const SHORT_MONTH = new Intl.DateTimeFormat('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });

/** "2026-10-01" -> "Oct 26". */
export function shortMonthLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return SHORT_MONTH.format(new Date(Date.UTC(year, month - 1, 1)));
}

/** The April-to-March year a month falls in, by its starting year. */
export function financialYearOf(period: string): number {
  const [year, month] = period.split('-').map(Number);
  return month >= 4 ? year : year - 1;
}

export function financialYearLabel(startYear: number): string {
  return `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

const percentOf = (change: number, base: number | null): number | null =>
  base ? Math.round((change / base) * 1000) / 10 : null;

/** Arranges a salary history for the graph, the increment list and yearly totals. */
export function salaryTrend(history: SalaryHistory, asOfPeriod: string): SalaryTrend {
  const months = [...history.months].sort((a, b) => a.period.localeCompare(b.period));
  const revisions = [...history.revisions].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

  const points = months.map(month => ({
    period: month.period,
    label: shortMonthLabel(month.period),
    monthlySalary: month.monthlySalary,
    inHand: month.inHand,
    incentives: money(month.incentiveTotal),
    deductions: money(month.fixedTotal + month.variableTotal),
  }));

  const increments = revisions.map((revision, index) => {
    const from = index ? revisions[index - 1].monthlySalary : null;
    const change = from === null ? null : money(revision.monthlySalary - from);
    return { effectiveFrom: revision.effectiveFrom, from, to: revision.monthlySalary, change, percent: change === null ? null : percentOf(change, from) };
  });

  const started = revisions.filter(revision => revision.effectiveFrom <= asOfPeriod);
  const currentSalary = started.length ? started[started.length - 1].monthlySalary : null;
  const first = started[0]?.monthlySalary ?? null;
  const growth = started.length > 1 && currentSalary !== null && first !== null
    ? { change: money(currentSalary - first), percent: percentOf(currentSalary - first, first) }
    : null;

  const byYear = new Map<number, SalaryMonth[]>();
  for (const month of months) {
    const year = financialYearOf(month.period);
    byYear.set(year, [...(byYear.get(year) ?? []), month]);
  }
  const years = [...byYear.entries()].sort(([a], [b]) => b - a).map(([startYear, yearMonths]) => {
    const named = new Map<string, number>();
    for (const item of yearMonths.flatMap(month => month.breakdown.incentives)) named.set(item.name, (named.get(item.name) ?? 0) + item.amount);
    return {
      label: financialYearLabel(startYear),
      startYear,
      months: yearMonths.length,
      inHand: money(yearMonths.reduce((sum, month) => sum + (month.inHand ?? 0), 0)),
      incentives: money(yearMonths.reduce((sum, month) => sum + month.incentiveTotal, 0)),
      deductions: money(yearMonths.reduce((sum, month) => sum + month.fixedTotal + month.variableTotal, 0)),
      incentivesByName: [...named.entries()].map(([name, amount]) => ({ name, amount: money(amount) })).sort((a, b) => b.amount - a.amount),
    };
  });

  return { points, increments, currentSalary, growth, years };
}
