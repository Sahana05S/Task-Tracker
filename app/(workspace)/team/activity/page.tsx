import type { Metadata } from 'next';

import { ActivityLog } from '@/modules/records/components/activity-log';
import { ACTIVITY_PAGE, activityFilter, getActivity, parseCursor, seesAllActivity, type ActivityPage } from '@/modules/records';
import { requireProfile } from '@/shared/session/profile';
import { kolkataDate } from '@/shared/time/kolkata';
import { MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';

export const metadata: Metadata = {
  title: 'Activity · TaskPulse',
};

/**
 * Team > Activity: who changed what, newest first. Managers see the company;
 * members see their own actions and changes to their own records (enforced by
 * `activity_feed` in the database).
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; kind?: string; member?: string; before?: string }>;
}) {
  const profile = await requireProfile();
  const query = await searchParams;
  const filter = activityFilter(query, kolkataDate(), profile);
  const before = parseCursor(query.before);
  let page: ActivityPage | null = null;
  try {
    page = await getActivity(filter, before, ACTIVITY_PAGE);
  } catch (error) {
    console.error('Activity read failed', error);
  }
  const everyone = seesAllActivity(profile.role);

  return (
    <MissionPage>
      <MissionPageHeader
        eyebrow="Team · Activity"
        title="Activity"
        description={everyone
          ? 'Who changed what across the company, newest first.'
          : 'What you changed, and changes others made to your records and missions, newest first.'}
      />
      <ActivityLog filter={filter} page={page} paged={before !== null} canChooseMember={everyone} />
    </MissionPage>
  );
}
