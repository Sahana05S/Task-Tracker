import { runAwardJobs } from '@/modules/scoring/internal/stars/jobs';
import { authorizeWorkerRequest, workerClient, workerConnection } from '@/shared/supabase/worker';
import { kolkataDate } from '@/shared/time/kolkata';

/**
 * The award worker endpoint. PRIVATE (route handlers call it through the
 * module's index). It queues due awards up to yesterday and runs a batch of up
 * to 10 jobs, each scoped to its company. The nightly GitHub Actions schedule
 * (.github/workflows/award-worker.yml) calls it until a batch comes back empty.
 */

/** Yesterday in Asia/Kolkata: the last fully closed award day. */
function lastClosedDay(): string {
  const end = new Date(kolkataDate() + 'T00:00:00Z');
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

export async function handleAwardWorkerRun(request: Request): Promise<Response> {
  const refused = authorizeWorkerRequest(request);
  if (refused) return refused;

  const connection = workerConnection();
  if (!connection) {
    return Response.json({ status: 'unavailable', reason: 'Award worker database is not configured.' }, { status: 503 });
  }
  const { url, key } = connection;

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
