// PRIVATE. The nightly photo clean-up (route handler calls it through the
// module's index). Check-in photos older than each company's retention period
// (Settings > Company > Check-in) are removed through the Storage API, then
// their rows forget the path; the check-in times and positions stay.
import { authorizeWorkerRequest, workerClient, workerConnection } from '@/shared/supabase/worker';

import { CHECK_IN_BUCKET } from './check-in';

const BATCH = 200;
/** Stop starting new batches after this long; the route allows 60 s. */
const TIME_BUDGET_MS = 45_000;

export async function handleAttendancePhotoRetention(request: Request): Promise<Response> {
  const refused = authorizeWorkerRequest(request, 'Photo clean-up');
  if (refused) return refused;
  const connection = workerConnection();
  if (!connection) return Response.json({ status: 'unavailable', reason: 'The service-role connection is not configured.' }, { status: 503 });
  // Unscoped: one pass over every company's expired photos.
  const db = workerClient(connection.url, connection.key);
  const deadline = Date.now() + TIME_BUDGET_MS;
  let removed = 0;
  for (;;) {
    const { data, error } = await db.rpc('attendance_photos_due', { p_limit: BATCH });
    if (error) return Response.json({ status: 'failed', removed, errorCode: 'due_photos_failed', reason: error.message }, { status: 500 });
    const due = (Array.isArray(data) ? data : []) as { id: string; path: string }[];
    if (!due.length) return Response.json({ status: 'done', removed, remaining: 0 });
    const { error: removeError } = await db.storage.from(CHECK_IN_BUCKET).remove(due.map(photo => photo.path));
    if (removeError) return Response.json({ status: 'failed', removed, errorCode: 'remove_failed', reason: removeError.message }, { status: 500 });
    const { data: cleared, error: clearError } = await db.rpc('attendance_photos_cleared', { p_ids: due.map(photo => photo.id) });
    if (clearError) return Response.json({ status: 'failed', removed, errorCode: 'clear_failed', reason: clearError.message }, { status: 500 });
    removed += cleared ?? 0;
    if (due.length < BATCH || Date.now() >= deadline) return Response.json({ status: 'done', removed, remaining: due.length < BATCH ? 0 : 1 });
  }
}
