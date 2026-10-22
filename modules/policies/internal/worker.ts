// PRIVATE. The nightly policies worker (route handlers call it through the
// module's index). Each call evaluates up to 20 due policy periods per active
// company, with a client scoped to that company, and reports what is left; the
// second loop of .github/workflows/award-worker.yml calls it until nothing is.
import { authorizeWorkerRequest, workerClient, workerConnection } from '@/shared/supabase/worker';

import { policyCommand } from './commands';
import { readDueWork, type Db } from './queries';
import { runDueItems, type RunSummary } from './run';

export interface CompanyOutcome {
  organizationId: string;
  status: RunSummary['status'] | 'idle';
  periods: number;
  evaluated: number;
  changed: number;
  notified: number;
  stale: number;
  /** Due periods left after this call. */
  remaining: number;
  errorCode?: string;
}

const BATCH = 20;

/** One pass over the companies; `clientFor` gives the scoped client of a company. */
export async function runPolicyWorker(organizations: string[], clientFor: (organizationId: string) => Db): Promise<CompanyOutcome[]> {
  const outcomes: CompanyOutcome[] = [];
  for (const organizationId of organizations) {
    const db = clientFor(organizationId);
    let due;
    try {
      due = await readDueWork(db, { limit: BATCH });
    } catch (error) {
      outcomes.push(await failedRead(db, organizationId, error));
      continue;
    }
    if (!due.items.length) {
      outcomes.push({ organizationId, status: 'idle', periods: 0, evaluated: 0, changed: 0, notified: 0, stale: 0, remaining: 0 });
      continue;
    }
    const trigger = due.items.every((item) => item.reason === 'invalidated') ? 'invalidation' : 'nightly';
    const run = await runDueItems(db, due.items, trigger);
    // A failed company keeps its due work for the next night rather than looping now.
    const remaining = run.status === 'failed' ? 0 : Math.max(due.remaining - due.items.length + run.stale, 0);
    outcomes.push({
      organizationId, status: run.status, periods: run.periods, evaluated: run.evaluated, changed: run.changed,
      notified: run.notified, stale: run.stale, remaining, ...(run.errorCode ? { errorCode: run.errorCode } : {}),
    });
  }
  return outcomes;
}

/** Due work could not be read: a failed run (and the directors' notice), never a silent skip. */
async function failedRead(db: Db, organizationId: string, error: unknown): Promise<CompanyOutcome> {
  const base = { organizationId, status: 'failed' as const, periods: 0, evaluated: 0, changed: 0, notified: 0, stale: 0, remaining: 0, errorCode: 'due_work_failed' };
  try {
    await policyCommand(db, 'record_failure', {
      trigger: 'nightly', errorCode: 'due_work_failed', errorDetail: (error instanceof Error ? error.message : String(error)).slice(0, 500),
    }, crypto.randomUUID());
  } catch {
    // The run could not be recorded either; the response still says failed.
  }
  return base;
}

export async function handlePolicyWorkerRun(request: Request): Promise<Response> {
  const refused = authorizeWorkerRequest(request, 'Policies worker');
  if (refused) return refused;
  const connection = workerConnection();
  if (!connection) {
    return Response.json({ status: 'unavailable', reason: 'Policies worker database is not configured.' }, { status: 503 });
  }
  const { url, key } = connection;
  const root = workerClient(url, key);
  const companies = await root.from('organizations').select('id').eq('status', 'active').order('created_at').order('id');
  if (companies.error) {
    return Response.json({ status: 'failed', reason: 'Companies could not be read.' }, { status: 503 });
  }
  const outcomes = await runPolicyWorker(companies.data.map((c) => c.id), (org) => workerClient(url, key, org));
  return Response.json({ outcomes, remaining: outcomes.reduce((n, o) => n + o.remaining, 0) });
}
