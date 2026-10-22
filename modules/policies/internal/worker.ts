// PRIVATE. The nightly policies worker (route handlers call it through the
// module's index). Each call works through the active companies one at a time,
// with a client scoped to that company, evaluating due policy periods 20 at a
// time until none are due or the call's time budget is spent; the second loop
// of .github/workflows/award-worker.yml calls again while work is left.
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
  /** Due periods left after this call, as the database counts them. */
  remaining: number;
  errorCode?: string;
}

const BATCH = 20;
/** Stop starting new batches after this long; the route allows 60 s. */
export const TIME_BUDGET_MS = 45_000;

const nothing = (organizationId: string, status: CompanyOutcome['status']): CompanyOutcome =>
  ({ organizationId, status, periods: 0, evaluated: 0, changed: 0, notified: 0, stale: 0, remaining: 0 });

/** Drains one company's due work in batches until none is due, it fails, or time runs out. */
async function runCompany(db: Db, organizationId: string, deadline: number, now: () => number): Promise<CompanyOutcome> {
  const outcome = nothing(organizationId, 'idle');
  for (;;) {
    let due;
    try {
      due = await readDueWork(db, { limit: BATCH });
    } catch (error) {
      await recordFailure(db, 'due_work_failed', error);
      return { ...outcome, status: 'failed', remaining: 0, errorCode: 'due_work_failed' };
    }
    outcome.remaining = due.remaining;
    if (!due.items.length || now() >= deadline) return outcome;
    const trigger = due.items.every((item) => item.reason === 'invalidated') ? 'invalidation' : 'nightly';
    const run = await runDueItems(db, due.items, trigger);
    outcome.status = run.status;
    outcome.periods += run.periods;
    outcome.evaluated += run.evaluated;
    outcome.changed += run.changed;
    outcome.notified += run.notified;
    outcome.stale += run.stale;
    // A failed company keeps its due work for the next night instead of retrying now.
    if (run.status === 'failed') return { ...outcome, remaining: 0, errorCode: run.errorCode };
    // Only stale periods were left (a period closed at midnight): the next call picks them up.
    if (run.stale === due.items.length) return outcome;
  }
}

async function recordFailure(db: Db, errorCode: string, error: unknown): Promise<void> {
  try {
    await policyCommand(db, 'record_failure', {
      trigger: 'nightly', errorCode, errorDetail: (error instanceof Error ? error.message : String(error)).slice(0, 500),
    }, crypto.randomUUID());
  } catch {
    // The failure could not be recorded either; the response still says failed.
  }
}

/** One call over the companies; `clientFor` gives the scoped client of a company. */
export async function runPolicyWorker(
  organizations: string[], clientFor: (organizationId: string) => Db, now: () => number = Date.now,
): Promise<CompanyOutcome[]> {
  const deadline = now() + TIME_BUDGET_MS;
  const outcomes: CompanyOutcome[] = [];
  for (const organizationId of organizations) {
    try {
      outcomes.push(await runCompany(clientFor(organizationId), organizationId, deadline, now));
    } catch {
      // Even recording the failure failed; the other companies still run.
      outcomes.push({ ...nothing(organizationId, 'failed'), errorCode: 'record_failed' });
    }
  }
  return outcomes;
}

export async function handlePolicyWorkerRun(request: Request): Promise<Response> {
  const refused = authorizeWorkerRequest(request, 'Policies worker');
  if (refused) return refused;
  const connection = workerConnection();
  if (!connection) {
    return Response.json({ status: 'unavailable', reason: 'Policies worker database is not configured.' }, { status: 503 });
  }
  const { url, key } = connection;
  const companies = await workerClient(url, key).from('organizations').select('id').eq('status', 'active').order('created_at').order('id');
  if (companies.error) {
    return Response.json({ status: 'failed', reason: 'Companies could not be read.' }, { status: 503 });
  }
  const outcomes = await runPolicyWorker(companies.data.map((c) => c.id), (org) => workerClient(url, key, org));
  return Response.json({ outcomes, remaining: outcomes.reduce((n, o) => n + o.remaining, 0) });
}
