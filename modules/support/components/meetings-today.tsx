import { listMeetings } from '../internal/meetings';
import { MeetingsTodayList } from './mission-meetings';

/** Today: "Meetings today" for the member (only meetings they are on). A failed read hides it. */
export async function MeetingsToday({ userId, today }: { userId: string; today: string }) {
  const meetings = await listMeetings({ from: today, to: today }).catch(() => null);
  const mine = (meetings ?? []).filter((meeting) => meeting.members.some((member) => member.id === userId))
    .sort((a, b) => (a.startTime ?? '99').localeCompare(b.startTime ?? '99'));
  return <MeetingsTodayList meetings={mine} />;
}
