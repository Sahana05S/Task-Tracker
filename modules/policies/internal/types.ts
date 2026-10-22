// PRIVATE. Domain types of the policies module (migration 56). Pure: shared
// by templates, the evaluator, the worker and client components (via client.ts).
import type { AttendanceStatus, UserRole } from '@/types/tracker';

export type PeriodKind = 'day' | 'week' | 'month';
export type Outcome = 'met' | 'not_met' | 'unavailable';
export type MemberRole = UserRole;

/** One policy period: keys 2026-10-19 (day), 2026-W43 (ISO week), 2026-10 (month). Dates inclusive. */
export interface Period {
  kind: PeriodKind;
  key: string;
  start: string;
  end: string;
}

export type Audience =
  | { kind: 'everyone' }
  | { kind: 'roles'; roles: MemberRole[] }
  | { kind: 'members'; ids: string[] };

export interface Reward {
  kind: 'commendation';
  badge: string;
  points: number;
}

export type ParameterValue = string | number | boolean;
export type Parameters = Record<string, ParameterValue>;

/** What the managing director saves: the policy_command create/revise payload. */
export interface PolicyDefinition {
  name: string;
  description: string;
  templateKey: string;
  parameters: Parameters;
  periodKind: PeriodKind;
  audience: Audience;
  reward: Reward;
  ruleVersion: string;
}

/** One member-day from policy_period_facts. Hours are null when not confirmed. */
export interface DayFact {
  date: string;
  status: AttendanceStatus | null;
  checkIn: string | null;
  regularHours: number | null;
  offHours: number | null;
  hoursConfirmed: boolean;
  loggedHours: number;
  active: boolean;
  teamHoliday: boolean;
}

export interface TaskCounts {
  open: number;
  overdue: number;
  stale: number;
  rotten: number;
  done: number;
  undated: number;
}

export interface ContributionCounts {
  facts: number;
  ideas: number;
  suggestions: number;
  sales: number;
}

export interface MemberFacts {
  userId: string;
  name: string;
  role: MemberRole;
  days: DayFact[];
  tasks: TaskCounts;
  contributions: ContributionCounts;
}

export interface FactsModel {
  readAt: string;
  from: string;
  to: string;
  /** Last day returned (min of `to` and today), or null when the range is in the future. */
  through: string | null;
  today: string;
  holidaySource: 'team_holiday_dates' | 'derived_rule' | 'none';
  teamHolidays: string[];
  members: MemberFacts[];
}

/** Why an outcome is what it is. `code` is a key of REASON_LABELS. */
export interface Reason {
  code: string;
  dates?: string[];
  count?: number;
  limit?: number;
}

export interface TemplateResult {
  outcome: Outcome;
  reasons: Reason[];
  evidence: Record<string, unknown>;
}

export interface MemberEvaluation extends TemplateResult {
  employeeId: string;
  name: string;
}

export interface PeriodEvaluation {
  period: Period;
  final: boolean;
  evaluations: MemberEvaluation[];
}
