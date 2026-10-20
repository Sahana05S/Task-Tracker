import type { SupabaseClient } from '@supabase/supabase-js';

import { bearerMatches } from '@/shared/security/bearer';
import { isMissingSchemaError } from '@/shared/supabase/schema-errors';
import { workerClient } from '@/shared/supabase/worker';
import type { Database } from '@/types/database';

/**
 * Background-job health for monitoring. PRIVATE (the route calls it through the
 * module's index). The counts come from one read-only service-role function,
 * `public.operations_health()`, because the outbox and award slots live in
 * taskpulse_private, which the API cannot read directly. Until that function is
 * installed the endpoint answers 503 "unavailable", never a healthy zero.
 */

/** What `operations_health()` returns. Counts cover every company. */
export interface RawOperationsHealth {
  /** Outbox jobs in status failed or blocked. */
  failedOrBlockedJobs: number;
  /** Running outbox jobs whose lease started more than 30 minutes ago. */
  longLeasedJobs: number;
  /** Award slots still stale for a business date more than 2 days old (Asia/Kolkata). */
  staleAwardSlots: number;
  /** Latest completed (winner or no-winner) award run, or null if none. */
  latestAwardSuccessAt: string | null;
}

export interface OperationsHealth extends RawOperationsHealth {
  status: 'healthy' | 'unhealthy';
}

const COUNTS = ['failedOrBlockedJobs', 'longLeasedJobs', 'staleAwardSlots'] as const;

/** Validates the database payload and decides healthy (all counts zero) or not. */
export function summariseHealth(raw: unknown): OperationsHealth {
  const value = (raw ?? {}) as Record<string, unknown>;
  const counts = {} as Record<(typeof COUNTS)[number], number>;
  for (const key of COUNTS) {
    const n = value[key];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) throw new Error(`Health payload lacks ${key}.`);
    counts[key] = n;
  }
  const latest = value.latestAwardSuccessAt;
  if (latest !== null && (typeof latest !== 'string' || Number.isNaN(Date.parse(latest)))) {
    throw new Error('Health payload has an invalid latestAwardSuccessAt.');
  }
  const healthy = COUNTS.every((key) => counts[key] === 0);
  return { status: healthy ? 'healthy' : 'unhealthy', ...counts, latestAwardSuccessAt: latest };
}

type HealthRead = () => Promise<unknown>;

/** Reads the raw counts; `null` means the read function is not installed yet. */
export async function readOperationsHealth(db: SupabaseClient<Database>): Promise<unknown | null> {
  // Not in the generated types until the function's migration lands.
  const rpc = db.rpc.bind(db) as unknown as (fn: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
  const { data, error } = await rpc('operations_health');
  if (error) {
    if (isMissingSchemaError(error.message)) return null;
    throw new Error('Operations health read failed.');
  }
  return data;
}

const noStore = { 'cache-control': 'no-store' };

export async function handleHealthCheck(request: Request, read?: HealthRead): Promise<Response> {
  const token = process.env.TASKPULSE_AWARD_WORKER_TOKEN;
  if (!token) {
    return Response.json({ status: 'unavailable', reason: 'Health check token is not configured.' }, { status: 503, headers: noStore });
  }
  if (!bearerMatches(request, token)) return Response.json({ status: 'forbidden' }, { status: 403, headers: noStore });

  if (!read) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return Response.json({ status: 'unavailable', reason: 'Health check database is not configured.' }, { status: 503, headers: noStore });
    }
    const db = workerClient(url, key);
    read = () => readOperationsHealth(db);
  }

  try {
    const raw = await read();
    if (raw === null) {
      return Response.json({ status: 'unavailable', reason: 'operations_health() is not installed in the database.' }, { status: 503, headers: noStore });
    }
    const health = summariseHealth(raw);
    return Response.json(health, { status: health.status === 'healthy' ? 200 : 503, headers: noStore });
  } catch {
    return Response.json({ status: 'unavailable', reason: 'Health counts could not be read.' }, { status: 503, headers: noStore });
  }
}
