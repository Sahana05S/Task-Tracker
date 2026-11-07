import type { Metadata } from 'next';

import { getLabelCatalogue } from '@/modules/labels';
import { listActivePeople, listMeetings } from '@/modules/support';
import { MeetingSheet } from '@/modules/support/components/meeting-sheet';
import { MeetingsList } from '@/modules/support/components/meetings-list';
import { getMissionPickerOptions } from '@/modules/tasks';
import { requireProfile } from '@/shared/session/profile';
import { kolkataDate } from '@/shared/time/kolkata';
import { MissionPage, MissionPageHeader } from '@/shared/ui/mission-ui';

export const metadata: Metadata = { title: 'Meetings' };

/**
 * Meetings (migration 136): the meetings the viewer is a member of (the managing director sees
 * every meeting), grouped by month with a search and filters, and New meeting.
 */
export default async function MeetingsPage() {
  const user = await requireProfile();
  const [meetings, catalogue, people, missions] = await Promise.all([
    listMeetings(),
    getLabelCatalogue().catch(() => null),
    listActivePeople(),
    getMissionPickerOptions(),
  ]);
  return (
    <MissionPage>
      <MissionPageHeader
        eyebrow="Records"
        title="Meetings"
        description="Minutes, decisions and action points. A meeting is seen only by its members and the managing director."
        actions={user.isActive ? <MeetingSheet today={kolkataDate()} members={people} missions={missions} viewerId={user.id} /> : null}
      />
      <MeetingsList meetings={meetings} labels={(catalogue?.labels ?? []).map((label) => ({ id: label.id, name: label.name }))} />
    </MissionPage>
  );
}
