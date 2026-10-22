// PRIVATE. Reads of migration 56. The database decides who may see what; a
// refusal or a missing function surfaces as an error the caller words.
import type { SupabaseClient } from '@supabase/supabase-js';

import { isMissingFunctionError } from '@/shared/supabase/schema-errors';
import type { Database, Json } from '@/types/database';

import type { OutcomeCounts } from './evaluate';
import type { Audience, FactsModel, Outcome, Parameters, PeriodKind, PolicyDefinition, Reason, Reward } from './types';

export type Db = SupabaseClient<Database>;

/** A read failed: `missing` when the database predates migration 56. */
export class PolicyReadError extends Error {
  constructor(message: string, readonly code: string | null, readonly missing: boolean) {
    super(message);
  }
}

function unwrap<T>(label: string, result: { data: Json | null; error: { code?: string; message: string } | null }, check: (v: T) => boolean): T {
  if (result.error) throw new PolicyReadError(`${label} failed: ${result.error.message}`, result.error.code ?? null, isMissingFunctionError(result.error));
  const value = result.data as unknown as T;
  if (value === null || typeof value !== 'object' || !check(value)) throw new PolicyReadError(`${label} returned an unexpected shape.`, null, false);
  return value;
}

export async function readFacts(db: Db, from: string, to: string, employee?: string | null): Promise<FactsModel> {
  return unwrap<FactsModel>('Policy facts', await db.rpc('policy_period_facts', { p_from: from, p_to: to, p_employee: employee ?? null }),
    (v) => typeof v.today === 'string' && Array.isArray(v.members));
}

export interface DueItem {
  policyId: string;
  policyVersion: number;
  definition: PolicyDefinition & { active?: boolean };
  periodKind: PeriodKind;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  open: boolean;
  reason: 'new' | 'open' | 'closed' | 'invalidated' | 'requested';
}
export interface DueWork { today: string; through: string; remaining: number; items: DueItem[] }

/** record_run's answer; `stale` counts periods that opened or closed since their facts were read (left due). */
export interface RecordResponse { runId: string; evaluated: number; changed: number; notified: number; stale: number }

export async function readDueWork(db: Db, options: { through?: string; limit?: number; policyId?: string } = {}): Promise<DueWork> {
  return unwrap<DueWork>('Policy due work', await db.rpc('policy_due_work', {
    p_through: options.through ?? null, p_limit: options.limit ?? 20, p_policy: options.policyId ?? null,
  }), (v) => Array.isArray(v.items) && typeof v.remaining === 'number');
}

export interface PolicyRow {
  id: string;
  name: string;
  description: string;
  templateKey: string;
  parameters: Parameters;
  periodKind: PeriodKind;
  audience: Audience | { kind: string };
  reward: Reward;
  ruleVersion: string;
  active: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  appliesToMe: boolean;
  period: { key: string; start: string; end: string };
  lastEvaluatedAt: string | null;
  counts: OutcomeCounts | null;
  mine: { outcome: Outcome; final: boolean; reasons: Reason[]; evaluatedAt: string } | null;
}
export interface PolicyList { today: string; canManage: boolean; isManager: boolean; policies: PolicyRow[] }

export async function readPolicyList(db: Db): Promise<PolicyList> {
  return unwrap<PolicyList>('Policies', await db.rpc('policy_list'), (v) => Array.isArray(v.policies));
}

export interface EvaluationRow {
  employeeId: string;
  name: string;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  policyVersion: number;
  outcome: Outcome;
  final: boolean;
  reasons: Reason[];
  evidence: Record<string, unknown>;
  previousOutcome: Outcome | null;
  commendedAt: string | null;
  withdrawn: boolean;
  evaluatedAt: string;
}

export async function readEvaluations(db: Db, policyId: string, periodKey?: string | null): Promise<EvaluationRow[]> {
  return unwrap<{ evaluations: EvaluationRow[] }>('Policy evaluations',
    await db.rpc('policy_evaluations_read', { p_policy: policyId, p_period_key: periodKey ?? null }), (v) => Array.isArray(v.evaluations)).evaluations;
}

export interface RunRow {
  id: string;
  trigger: 'nightly' | 'on_demand' | 'invalidation';
  status: 'completed' | 'failed';
  actorId: string | null;
  summary: { periods?: number; evaluated?: number; changed?: number; notified?: number; met?: number; notMet?: number; unavailable?: number };
  errorCode: string | null;
  errorDetail: string | null;
  recordedAt: string;
}

export async function readRuns(db: Db, limit = 20): Promise<RunRow[]> {
  return unwrap<{ runs: RunRow[] }>('Policy runs', await db.rpc('policy_runs_read', { p_limit: limit }), (v) => Array.isArray(v.runs)).runs;
}

export interface CommendationRow {
  policyId: string;
  policyName: string;
  badge: string;
  points: number;
  periodKind: PeriodKind;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  employeeId: string;
  name: string;
  commendedAt: string | null;
}

export async function readCommendations(db: Db, range: { from?: string | null; to?: string | null; employee?: string | null } = {}): Promise<CommendationRow[]> {
  return unwrap<{ commendations: CommendationRow[] }>('Commendations', await db.rpc('policy_commendations', {
    p_from: range.from ?? null, p_to: range.to ?? null, p_employee: range.employee ?? null,
  }), (v) => Array.isArray(v.commendations)).commendations;
}
