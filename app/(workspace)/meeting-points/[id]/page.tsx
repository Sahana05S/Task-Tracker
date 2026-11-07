import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarDaysIcon, ClockIcon, FileTextIcon, HistoryIcon, TagIcon } from 'lucide-react';

import { getLabelCatalogue, getLabelsFor } from '@/modules/labels';
import { listActivePeople, readMeeting } from '@/modules/support';
import { MeetingMembers, WithdrawMeeting } from '@/modules/support/components/meeting-members';
import { MeetingMinutes } from '@/modules/support/components/meeting-minutes';
import { MeetingPointsPanel } from '@/modules/support/components/meeting-points-panel';
import { MeetingSheet } from '@/modules/support/components/meeting-sheet';
import { getMissionPickerOptions } from '@/modules/tasks';
import { requireProfile } from '@/shared/session/profile';
import { kolkataDate } from '@/shared/time/kolkata';
import { formatDate, formatDateTime } from '@/shared/tracker/format';
import { MissionPage, MissionPageHeader, MissionPanel } from '@/shared/ui/mission-ui';
import { Breadcrumb } from '@/shared/ui/page-nav';

export const metadata: Metadata = { title: 'Meeting' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * One meeting (migration 136): date, type, members and linked missions; the minutes (autosaved);
 * the points with quick add and one-tap status; documents (next update) and history. Only its
 * members and the managing director can open it; anyone else gets "not found".
 */
export default async function MeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [user, meeting] = await Promise.all([requireProfile(), readMeeting(id)]);
  if (!meeting) notFound();
  const canEdit = meeting.canEdit && user.isActive;
  const [people, catalogue, labels, missions] = await Promise.all([
    listActivePeople(),
    getLabelCatalogue().catch(() => null),
    meeting.points.length ? getLabelsFor('meeting_point', meeting.points.map((point) => point.id)).catch(() => null) : Promise.resolve(null),
    canEdit ? getMissionPickerOptions(meeting.missions.map((mission) => mission.id)) : Promise.resolve([]),
  ]);
  const names = new Map([...people.map((p) => [p.id, p.name] as const), ...meeting.members.map((m) => [m.id, m.name] as const)]);
  const savedLine = meeting.minutesSavedAt
    ? `Last saved by ${names.get(meeting.minutesSavedBy ?? '') ?? 'a former member'}, ${formatDateTime(meeting.minutesSavedAt)}`
    : null;

  return (
    <MissionPage>
      <MissionPageHeader
        breadcrumb={<Breadcrumb back={{ href: '/meeting-points', label: 'Back to meetings' }} items={[{ label: 'Meetings', href: '/meeting-points' }, { label: meeting.title }]} />}
        title={meeting.title}
        meta={
          <>
            <span className="badge-soft badge-neutral inline-flex items-center gap-1"><CalendarDaysIcon className="size-3" aria-hidden="true" />{formatDate(meeting.date)}</span>
            {meeting.startTime ? <span className="badge-soft badge-neutral inline-flex items-center gap-1"><ClockIcon className="size-3" aria-hidden="true" />{meeting.startTime}</span> : null}
            {meeting.meetingType ? <span className="badge-soft badge-neutral inline-flex items-center gap-1"><TagIcon className="size-3" aria-hidden="true" />{meeting.meetingType}</span> : null}
            {meeting.state === 'withdrawn' ? <span className="badge-soft badge-status-discarded">Withdrawn</span> : null}
          </>
        }
        actions={canEdit ? <MeetingSheet today={kolkataDate()} members={people} missions={missions} meeting={meeting} viewerId={user.id} /> : null}
      />

      <section className="soft-card grid gap-4 p-5 sm:p-6" aria-label="Members and missions">
        <MeetingMembers meetingId={meeting.id} members={meeting.members} candidates={people} canEdit={canEdit} canManage={canEdit && meeting.canManage} />
        {meeting.missions.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground text-xs font-semibold">Missions</span>
            {meeting.missions.map((mission) => (
              <Link key={mission.id} href={`/tasks/${encodeURIComponent(mission.tag)}`} className="badge-soft badge-neutral inline-flex max-w-full items-center gap-1 hover:underline">
                <span className="font-mono text-xs">{mission.tag}</span><span className="max-w-[14rem] truncate">{mission.title}</span>
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
        <MeetingMinutes key={meeting.id} meetingId={meeting.id} minutes={meeting.minutes} version={meeting.version} canEdit={canEdit} savedLine={savedLine} />
        <MeetingPointsPanel
          meetingId={meeting.id}
          points={meeting.points}
          people={people}
          missions={meeting.missions}
          labels={labels}
          catalogue={catalogue ? catalogue.labels.filter((label) => !label.archived) : null}
          canEdit={canEdit}
          canCreateLabels={catalogue?.canManage ?? false}
          viewerId={user.id}
        />
      </div>

      <MissionPanel icon={FileTextIcon} title="Documents" subtitle="Files for this meeting">
        <p className="text-muted-foreground text-sm">Meeting documents arrive with the next update.</p>
      </MissionPanel>

      <MissionPanel icon={HistoryIcon} title="History">
        <ul className="text-muted-foreground grid gap-1 text-sm">
          <li>Created {formatDateTime(meeting.createdAt)}{meeting.createdBy ? ` by ${names.get(meeting.createdBy) ?? 'a former member'}` : ' from the earlier meeting points'}.</li>
          {savedLine ? <li>Minutes: {savedLine.charAt(0).toLowerCase() + savedLine.slice(1)}.</li> : null}
          <li>Each point keeps every change: open a point&apos;s Details, then History.</li>
          <li><Link href="/team/activity?kind=records" className="link">Team › Activity</Link> lists who changed the meeting.</li>
        </ul>
        {canEdit && meeting.canManage ? <div className="border-border mt-4 border-t pt-3"><WithdrawMeeting meetingId={meeting.id} /></div> : null}
      </MissionPanel>
    </MissionPage>
  );
}
