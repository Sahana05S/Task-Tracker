'use client';

import * as React from 'react';
import Link from 'next/link';
import { CalendarDaysIcon, CircleDotIcon, SearchIcon, UsersIcon } from 'lucide-react';

import { BUSINESS_DOT_CLASS, businessQueryFilter, EVERY_BUSINESS, type Business, type BusinessSelection } from '@/modules/businesses/client';
import { BusinessChips } from '@/modules/businesses/components/business-chips';
import { filterMeetings, groupMeetingsByMonth, type MeetingSummary } from '@/modules/support/client';
import { cn } from '@/shared/utils';
import { EmptyState, InitialsAvatar } from '@/shared/ui/mission-ui';

export interface MeetingFilterLabel { readonly id: string; readonly name: string }

/**
 * "My meetings" (migration 136): the meetings the viewer is a member of (the managing director
 * sees every meeting), grouped by month, newest first, with a search and mission / label filters.
 * Each row shows the date, title, members and open points and opens the meeting.
 */
export function MeetingsList({ meetings, labels, businesses = [] }: {
  meetings: readonly MeetingSummary[];
  labels: readonly MeetingFilterLabel[];
  /** The company's businesses (migration 134): chips over the list; none hides them. */
  businesses?: readonly Business[];
}) {
  const [selection, setSelection] = React.useState<BusinessSelection>(EVERY_BUSINESS);
  const [search, setSearch] = React.useState('');
  const [missionId, setMissionId] = React.useState('');
  const [labelId, setLabelId] = React.useState('');
  const missions = React.useMemo(() => {
    const seen = new Map<string, { id: string; tag: string; title: string }>();
    for (const meeting of meetings) for (const mission of meeting.missions) seen.set(mission.id, mission);
    return [...seen.values()].sort((a, b) => a.tag.localeCompare(b.tag, 'en', { numeric: true }));
  }, [meetings]);
  const usedLabels = React.useMemo(() => {
    const used = new Set(meetings.flatMap((meeting) => meeting.labelIds));
    return labels.filter((label) => used.has(label.id));
  }, [meetings, labels]);
  const shown = filterMeetings(meetings, { search, missionId: missionId || null, labelId: labelId || null, businesses: businessQueryFilter(selection) });
  const businessById = new Map(businesses.map((b) => [b.id, b]));
  const groups = groupMeetingsByMonth(shown);

  return (
    <section aria-label="My meetings" className="grid min-w-0 content-start gap-4">
      {businesses.length ? <BusinessChips businesses={businesses} selection={selection} onChange={setSelection} /> : null}
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <label className="relative block">
          <span className="sr-only">Search meetings</span>
          <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden="true" />
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, type, people or mission" className="field pl-9" />
        </label>
        {missions.length ? (
          <label className="block"><span className="sr-only">Mission</span>
            <select value={missionId} onChange={(event) => setMissionId(event.target.value)} className="field">
              <option value="">All missions</option>
              {missions.map((mission) => <option key={mission.id} value={mission.id}>{mission.tag} - {mission.title}</option>)}
            </select>
          </label>
        ) : null}
        {usedLabels.length ? (
          <label className="block"><span className="sr-only">Label</span>
            <select value={labelId} onChange={(event) => setLabelId(event.target.value)} className="field">
              <option value="">All labels</option>
              {usedLabels.map((label) => <option key={label.id} value={label.id}>#{label.name}</option>)}
            </select>
          </label>
        ) : null}
      </div>

      {groups.length === 0 ? (
        <EmptyState icon={CalendarDaysIcon} title={meetings.length ? 'No meeting matches' : 'No meetings yet'}>
          {meetings.length ? 'Clear the search or filters to see every meeting.' : 'Meetings you are a member of appear here. Start one with New meeting.'}
        </EmptyState>
      ) : groups.map((group) => (
        <div key={group.month} className="grid gap-2">
          <h2 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{group.label}</h2>
          <ul className="soft-card divide-border divide-y overflow-hidden p-0">
            {group.meetings.map((meeting) => <MeetingRow key={meeting.id} meeting={meeting} business={meeting.businessId ? businessById.get(meeting.businessId) : undefined} />)}
          </ul>
        </div>
      ))}
    </section>
  );
}

function MeetingRow({ meeting, business }: { meeting: MeetingSummary; business?: Business }) {
  const day = new Date(`${meeting.date}T00:00:00Z`);
  const weekday = day.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
  return (
    <li>
      <Link href={`/meeting-points/${meeting.id}`} className="hover:bg-muted/50 flex items-center gap-3 px-4 py-3 sm:gap-4">
        <span className="bg-primary-subtle text-primary grid w-12 shrink-0 justify-items-center rounded-lg py-1.5 leading-none">
          <span className="text-lg font-bold">{day.getUTCDate()}</span>
          <span className="text-[11px] font-medium">{weekday}</span>
        </span>
        <span className="grid min-w-0 flex-1 gap-1">
          <span className="text-foreground truncate text-[15px] font-semibold">{meeting.title}</span>
          <span className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {meeting.startTime ? <span>{meeting.startTime}</span> : null}
            {meeting.businessName ? (
              <span className="inline-flex items-center gap-1">
                <span aria-hidden="true" className={cn('size-2 rounded-full', business ? BUSINESS_DOT_CLASS[business.colour] : 'bg-muted-foreground')} />{meeting.businessName}
              </span>
            ) : null}
            {meeting.meetingType ? <span className="truncate">{meeting.meetingType}</span> : null}
            {meeting.missions.length ? <span className="truncate font-mono">{meeting.missions.slice(0, 2).map((m) => m.tag).join(', ')}{meeting.missions.length > 2 ? ` +${meeting.missions.length - 2}` : ''}</span> : null}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="flex -space-x-2" title={meeting.members.map((m) => m.name).join(', ')}>
            {meeting.members.slice(0, 3).map((member) => <InitialsAvatar key={member.id} name={member.name} className="ring-card size-6 text-[9px] ring-2" />)}
            {meeting.members.length > 3 ? <span className="bg-muted text-muted-foreground ring-card grid size-6 place-items-center rounded-full text-[9px] font-semibold ring-2">+{meeting.members.length - 3}</span> : null}
            {meeting.members.length === 0 ? <UsersIcon className="text-muted-foreground size-4" aria-label="No members" /> : null}
          </span>
          {meeting.openPoints ? (
            <span className="badge-soft badge-status-in-progress inline-flex items-center gap-1 text-[11px]"><CircleDotIcon className="size-3" aria-hidden="true" />{meeting.openPoints} open</span>
          ) : meeting.pointCount ? <span className="text-muted-foreground text-[11px]">{meeting.pointCount} {meeting.pointCount === 1 ? 'point' : 'points'}</span> : null}
        </span>
      </Link>
    </li>
  );
}
