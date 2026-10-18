import { createHash, timingSafeEqual } from 'node:crypto';

import { runAwardJobs } from '@/modules/scoring/internal/stars/jobs';
import { workerClient } from '@/shared/supabase/worker';
import { kolkataDate } from '@/shared/time/kolkata';

/**
 * The award sandbox worker endpoint. PRIVATE (route handlers call it through
 * the module's index). It queues due awards up to yesterday and runs a batch,
 * each job scoped to its company.
 */

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Checks configuration and the bearer token. Returns an error response, or null to continue. */
function refuseUnlessAuthorised(request: Request): Response | null {
  const token = process.env.TASKPULSE_AWARD_WORKER_TOKEN;
  if (!token || process.env.TASKPULSE_AWARD_WORKER_ENABLED !== 'sandbox') {
    return Response.json({ status: 'unavailable', reason: 'Award sandbox worker is not configured.' }, { status: 503 });
  }
  const supplied = request.headers.get('authorization') ?? '';
  if (!timingSafeEqual(digest(supplied), digest('Bearer ' + token))) {
    return Response.json({ status: 'forbidden' }, { status: 403 });
  }
  return null;
}

/** Yesterday in Asia/Kolkata: the last fully closed award day. */
function lastClosedDay(): string {
  const end = new Date(kolkataDate() + 'T00:00:00Z');
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

export async function handleAwardWorkerRun(request: Request): Promise<Response> {
  const refused = refuseUnlessAuthorised(request);
  if (refused) return refused;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return Response.json({ status: 'unavailable', reason: 'Award worker database is not configured.' }, { status: 503 });
  }

  const db = workerClient(url, key);
  try {
    const through = lastClosedDay();
    const queued = await db.rpc('queue_due_awards', {
      p_from: through.slice(0, 8) + '01',
      p_through: through,
      p_operation: crypto.randomUUID(),
    });
    if (queued.error) throw new Error('Schedule queue failed.');
    const outcomes = await runAwardJobs(db, 10, (org) => workerClient(url, key, org));
    return Response.json({ schedule: queued.data, outcomes });
  } catch {
    return Response.json({ status: 'failed', reason: 'Award worker could not finish; inspect retained jobs.' }, { status: 503 });
  }
}
