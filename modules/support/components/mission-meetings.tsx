import Link from 'next/link';
import { CalendarDaysIcon, UsersIcon } from 'lucide-react';

import type { MeetingSummary } from '@/modules/support/client';
import { MissionPanel } from '@/shared/ui/mission-ui';
import { formatDate } from '@/shared/tracker/format';

/**
 * Mission page: the meetings linked to this mission that the viewer may read (a member of the
 * meeting, or the managing director; migration 136). Hidden when there is none.
 */
export function MissionMeetingsPanel({ meetings }: { meetings: readonly MeetingSummary[] | null }) {
  if (!meetings?.length) return null;
  return (
    <MissionPanel icon={CalendarDaysIcon} title="Meetings" subtitle={`${meetings.length} linked to this mission`}>
      <ul className="divide-border grid divide-y">
        {meetings.slice(0, 8).map((meeting) => (
          <li key={meeting.id} className="py-2 first:pt-0 last:pb-0">
            <Link href={`/meeting-points/${meeting.id}`} className="grid gap-0.5 hover:underline">
              <span className="text-foreground truncate text-sm font-medium">{meeting.title}</span>
              <span className="text-muted-foreground text-xs">
                {[formatDate(meeting.date), meeting.openPoints ? `${meeting.openPoints} open ${meeting.openPoints === 1 ? 'point' : 'points'}` : null].filter(Boolean).join(' · ')}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {meetings.length > 8 ? <Link href="/meeting-points" className="link mt-3 inline-block text-sm">All meetings</Link> : null}
    </MissionPanel>
  );
}

/** Today: the member's meetings today (only meetings they are a member of). Hidden when there is none. */
export function MeetingsTodayList({ meetings }: { meetings: readonly MeetingSummary[] }) {
  if (!meetings.length) return null;
  return (
    <section aria-label="Meetings today" className="border-border bg-card mb-5 grid gap-2 rounded-xl border px-4 py-3">
      <h2 className="text-foreground flex items-center gap-2 text-sm font-semibold"><CalendarDaysIcon className="text-primary size-4" aria-hidden="true" />Meetings today</h2>
      <ul className="grid gap-1.5">
        {meetings.map((meeting) => (
          <li key={meeting.id}>
            <Link href={`/meeting-points/${meeting.id}`} className="hover:bg-muted/60 -mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm">
              <span className="text-muted-foreground w-11 shrink-0 font-mono text-xs">{meeting.startTime ?? 'Today'}</span>
              <span className="text-foreground min-w-0 flex-1 truncate font-medium">{meeting.title}</span>
              <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1 text-xs"><UsersIcon className="size-3.5" aria-hidden="true" />{meeting.members.length}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
