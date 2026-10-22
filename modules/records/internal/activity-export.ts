import { NextResponse } from 'next/server';

import { getCurrentProfile } from '@/shared/session/profile';
import { kolkataDate } from '@/shared/time/kolkata';
import { getActivity } from './activity';
import { ACTIVITY_MAX_PAGE, activityCsv, activityFilter, type ActivityCursor, type ActivityEntry, type Person } from './activity-mapping';

/** Most rows one download holds; the file says when it stopped short. */
const EXPORT_CAP = 5000;

/**
 * GET handler for `/api/records/activity`: the activity log for `from`, `to`,
 * `kind`, `member` as CSV, read page by page through the same database rule
 * as the page. PRIVATE (the route calls it through the module's index).
 */
export async function handleActivityExport(request: Request): Promise<Response> {
  const profile = await getCurrentProfile();
  if (!profile?.isActive) return NextResponse.json({ error: 'Active authentication required.' }, { status: 403 });
  const p = new URL(request.url).searchParams;
  const filter = activityFilter({ from: p.get('from'), to: p.get('to'), kind: p.get('kind'), member: p.get('member') }, kolkataDate(), profile);
  const entries: ActivityEntry[] = [];
  let before: ActivityCursor | null = null;
  let people: Person[] | undefined;
  try {
    do {
      const page = await getActivity(filter, before, ACTIVITY_MAX_PAGE, people);
      if (!page.available) return NextResponse.json({ error: 'The activity log is not available on this database yet.' }, { status: 503 });
      entries.push(...page.entries);
      people = page.people;
      before = page.next;
    } while (before && entries.length < EXPORT_CAP);
  } catch (error) {
    console.error('Activity export failed', error);
    return NextResponse.json({ error: 'Activity unavailable. Retry shortly.' }, { status: 503 });
  }
  const body = activityCsv(entries.slice(0, EXPORT_CAP)) + (before ? `\r\n"Stopped at ${EXPORT_CAP} rows; narrow the dates for the rest."` : '');
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="taskpulse-activity-${filter.from}-to-${filter.to}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
