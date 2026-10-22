// PRIVATE. The template contract. Adding a template is one file in this
// folder, one line in ./index.ts and its fixture cases: no migration.
import type { DayFact, MemberFacts, Parameters, Period, PeriodKind, Reason, Reward, TemplateResult } from '../types';

export type ParameterSpec =
  | { key: string; label: string; help?: string; type: 'time' }
  | { key: string; label: string; help?: string; type: 'integer' | 'number'; min: number; max: number; step?: number; unit?: string }
  | { key: string; label: string; help?: string; type: 'boolean' }
  | { key: string; label: string; help?: string; type: 'choice'; options: { value: string; label: string }[] };

export interface TemplateContext {
  member: MemberFacts;
  period: Period;
  /** Asia/Kolkata today. Days after it are not in the facts. */
  today: string;
  /** The period has ended: the result is final. */
  final: boolean;
}

export interface PolicyTemplate {
  key: string;
  label: string;
  /** One plain sentence with the parameters filled in. */
  summary: (params: Parameters, periodKind: PeriodKind) => string;
  periodKinds: PeriodKind[];
  parameters: ParameterSpec[];
  defaults: Parameters;
  defaultReward: Omit<Reward, 'kind'>;
  /** Bump when the template's meaning changes; stored as the policy's rule version. */
  ruleVersion: string;
  evaluate: (ctx: TemplateContext, params: Parameters) => TemplateResult;
}

export function num(params: Parameters, key: string, fallback: number): number {
  const value = params[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
export function bool(params: Parameters, key: string, fallback: boolean): boolean {
  const value = params[key];
  return typeof value === 'boolean' ? value : fallback;
}
export function str(params: Parameters, key: string, fallback: string): string {
  const value = params[key];
  return typeof value === 'string' ? value : fallback;
}

export type DayKind = 'working' | 'half' | 'holiday' | 'leave' | 'off' | 'absent' | 'missing' | 'pending';

/**
 * What a member-day is for the attendance templates. A team holiday or a
 * Holiday record is not a working day; a day with no record is `missing`
 * (the outcome becomes unavailable), except today, which is still `pending`.
 */
export function dayKind(day: DayFact, today: string): DayKind {
  if (day.teamHoliday || day.status === 'Holiday') return 'holiday';
  switch (day.status) {
    case 'Present': return 'working';
    case 'Half Day': return 'half';
    case 'Leave': return 'leave';
    case 'Off Hours': return 'off';
    case 'Absent': return 'absent';
    default: return day.date >= today ? 'pending' : 'missing';
  }
}

/** Working days for templates where a Half Day may or may not count. */
export function isWorking(kind: DayKind, halfDaysCount: boolean): boolean {
  return kind === 'working' || (kind === 'half' && halfDaysCount);
}

/** met unless something failed; unavailable when inputs are missing and nothing failed. */
export function decide(failed: Reason[], missing: Reason[], evidence: Record<string, unknown>, extra: Reason[] = []): TemplateResult {
  if (failed.length) return { outcome: 'not_met', reasons: [...failed, ...missing, ...extra], evidence };
  if (missing.length) return { outcome: 'unavailable', reasons: [...missing, ...extra], evidence };
  return { outcome: 'met', reasons: extra, evidence };
}

/** Nothing to judge (every day a holiday, leave or off): unavailable, never a vacuous "met". */
export function noWorkingDays(working: number, otherReasons: number): Reason[] {
  return working === 0 && otherReasons === 0 ? [reason('no_working_days')] : [];
}

export function reason(code: string, dates: string[] = [], more: Omit<Reason, 'code' | 'dates'> = {}): Reason {
  return dates.length ? { code, dates, count: dates.length, ...more } : { code, ...more };
}

export function plural(n: number, one: string, many = one + 's'): string {
  return `${n} ${n === 1 ? one : many}`;
}
