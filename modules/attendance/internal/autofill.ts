// PRIVATE. The end-of-day attendance marking (route handler calls it through
// the module's index; first step of .github/workflows/award-worker.yml, before
// the award run). attendance_autofill (migration 73) marks every ended day
// without a record: Present after a check-in, Holiday on weekly off days and
// calendar holidays, Absent otherwise. One call covers every company.
import { authorizeWorkerRequest, workerClient, workerConnection } from '@/shared/supabase/worker';

export async function handleAttendanceAutofill(request: Request): Promise<Response> {
  const refused = authorizeWorkerRequest(request, 'Attendance marking');
  if (refused) return refused;
  const connection = workerConnection();
  if (!connection) return Response.json({ status: 'unavailable', reason: 'The service-role connection is not configured.' }, { status: 503 });
  const { data, error } = await workerClient(connection.url, connection.key).rpc('attendance_autofill', {});
  if (error) return Response.json({ status: 'failed', errorCode: 'autofill_failed', reason: error.message }, { status: 500 });
  return Response.json({ status: 'done', result: data });
}
