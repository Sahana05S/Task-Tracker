import { FACTORS, type AwardDay, type Factor, type MemberCalculation } from '@/modules/scoring/client';
import { csvCell } from '@/modules/reports/internal/presentation/export';
import { Exact } from '@/shared/math/exact';
import { ISO_DATE_PATTERN, UUID_PATTERN } from '@/shared/forms/form-data';
import type { UserRole } from '@/types/tracker';

/**
 * The daily perf log's pure parts: URL filter, rows from retained daily award
 * runs and the CSV. Client-safe; `getDailyPerfLog` in team-analytics.ts reads
 * the sources. PRIVATE (exported through client.ts).
 */

export type DailyPerfStatus = 'calculated' | 'uncertified' | 'not_calculated';
export const DAILY_PERF_STATUS_LABEL: Record<DailyPerfStatus, string> = {
  calculated: 'Calculated',
  uncertified: 'Not certified',
  not_calculated: 'Not calculated',
};
/** Longest date range one read or download may span. */
export const DAILY_PERF_MAX_DAYS = 92;

export interface DailyPerfFilter { from: string; to: string; member: string | null }
export interface DailyPerfRow {
  date: string;
  userId: string;
  fullName: string;
  status: DailyPerfStatus;
  /** Difference from the team median per factor, six decimals; null when not calculated or unavailable. */
  factors: Record<Factor, string | null>;
  /** The shared composite score, two decimals; null when it is incomplete or not calculated. */
  sum: string | null;
  /** Unreversed task hours logged that day, two decimals. */
  hours: string;
}
export interface DailyPerfLog extends DailyPerfFilter {
  rows: DailyPerfRow[];
  /** Members the rows cover: active members and anyone with a run, or just the filtered member. */
  members: { id: string; fullName: string }[];
  /** Everyone a manager may filter by (active members and anyone with a run in the range), by name. */
  options: { id: string; fullName: string }[];
}
type RetainedDay = Pick<AwardDay, 'date' | 'certified'> & { candidates: { userId: string; calculation: MemberCalculation }[] };

const TEAM_DETAIL_ROLES: readonly UserRole[] = ['managing_director', 'project_engineer'];

/** Roles that see every member's daily detail (the award read model's own rule). */
export function seesTeamDetail(role: UserRole): boolean {
  return TEAM_DETAIL_ROLES.includes(role);
}

export function factorLabel(factor: Factor): string {
  return factor[0].toUpperCase() + factor.slice(1);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function validDate(value: string | undefined): value is string {
  return Boolean(value && ISO_DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && addDays(value, 0) === value);
}

/** Month to date for a calendar month: its first day to `today`, clamped to the month. */
export function monthToDate(period: { startDate: string; endDate: string }, today: string): { from: string; to: string } {
  const to = today < period.startDate ? period.startDate : today > period.endDate ? period.endDate : today;
  return { from: period.startDate, to };
}

/**
 * Reads the log filter from URL values. Invalid dates fall back to the
 * defaults, a reversed range is swapped, and a range longer than
 * DAILY_PERF_MAX_DAYS keeps its last days. Members only ever see themselves
 * (the award read enforces the same rule in the database).
 */
export function dailyPerfFilter(
  query: { member?: string | null; from?: string | null; to?: string | null },
  defaults: { from: string; to: string },
  viewer: { id: string; role: UserRole },
): DailyPerfFilter {
  let from = validDate(query.from ?? undefined) ? query.from! : defaults.from;
  let to = validDate(query.to ?? undefined) ? query.to! : defaults.to;
  if (from > to) [from, to] = [to, from];
  if (addDays(from, DAILY_PERF_MAX_DAYS - 1) < to) from = addDays(to, -(DAILY_PERF_MAX_DAYS - 1));
  const member = !seesTeamDetail(viewer.role) ? viewer.id : query.member && UUID_PATTERN.test(query.member) ? query.member : null;
  return { from, to, member };
}

/**
 * One row per member per day, newest day first. A day reads its latest
 * retained award run only: no run (or no candidate for the member) is "Not
 * calculated", and a run that is not certified (stale or uncertified) is
 * marked. Nothing is recalculated here.
 */
export function dailyPerfRows(input: {
  from: string;
  to: string;
  members: readonly { id: string; fullName: string }[];
  days: readonly RetainedDay[];
  hours: ReadonlyMap<string, Exact>;
}): DailyPerfRow[] {
  const byDate = new Map(input.days.map((day) => [day.date, day]));
  const runs = new Map(input.days.flatMap((day) => day.candidates.map((entry) => [`${entry.userId}|${day.date}`, entry.calculation] as const)));
  const members = [...input.members].sort((a, b) => a.fullName.localeCompare(b.fullName));
  const rows: DailyPerfRow[] = [];
  for (let date = input.to; date >= input.from; date = addDays(date, -1)) {
    const day = byDate.get(date);
    for (const member of members) {
      const calculation = runs.get(`${member.id}|${date}`);
      rows.push({
        date,
        userId: member.id,
        fullName: member.fullName,
        status: !calculation ? 'not_calculated' : day?.certified ? 'calculated' : 'uncertified',
        factors: Object.fromEntries(FACTORS.map((factor) => {
          const result = calculation?.factors[factor];
          return [factor, result?.available && result.deltaExact ? Exact.from(result.deltaExact).display(6) : null];
        })) as Record<Factor, string | null>,
        sum: calculation?.compositeExact ? Exact.from(calculation.compositeExact).display(2) : null,
        hours: (input.hours.get(`${member.id}|${date}`) ?? Exact.from(0)).display(2),
      });
    }
  }
  return rows;
}

/** CSV of the log: one header row, then the rows as shown. */
export function dailyPerfCsv(rows: readonly DailyPerfRow[]): string {
  const header = ['Date', 'Member', ...FACTORS.map((factor) => `${factorLabel(factor)} (difference from median)`), 'Sum', 'Hours logged', 'Status'];
  const lines = rows.map((row) => [
    row.date,
    row.fullName,
    ...FACTORS.map((factor) => (row.status === 'not_calculated' ? '' : row.factors[factor] ?? 'Unavailable')),
    row.status === 'not_calculated' ? '' : row.sum ?? 'Incomplete',
    row.hours,
    DAILY_PERF_STATUS_LABEL[row.status],
  ]);
  // Plain decimals cannot start a formula, so they skip csvCell's leading-minus guard.
  const cell = (value: string) => (/^-?\d+(\.\d+)?$/.test(value) ? `"${value}"` : csvCell(value));
  return [header, ...lines].map((line) => line.map(cell).join(',')).join('\r\n');
}
