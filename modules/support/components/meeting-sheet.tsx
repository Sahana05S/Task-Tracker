'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PencilIcon, PlusIcon, SearchIcon } from 'lucide-react';

import { createMeetingAction, editMeetingAction } from '@/modules/support/meeting-actions';
import type { MeetingDetail } from '@/modules/support/client';
import type { Business } from '@/modules/businesses/client';
import { MeetingTypeSelect } from '@/modules/settings/components/meeting-type-select';
import type { MissionPickerOption } from '@/modules/tasks/client';
import { MissionPicker } from '@/modules/tasks/components/mission-picker';
import { Button } from '@/shared/ui/button';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';

export interface MeetingMemberChoice { readonly id: string; readonly name: string }

/**
 * New meeting (or Edit meeting, with `meeting`): title, date and time, type, linked missions and,
 * for a new one, its members. A bottom sheet on phones, a side panel on wider screens. A new
 * meeting opens on its own page once saved.
 */
export function MeetingSheet({ today, members, missions, meeting, viewerId, businesses = [] }: {
  today: string;
  /** The company's businesses (migration 134); none hides the field. */
  businesses?: readonly Business[];
  members: readonly MeetingMemberChoice[];
  missions: readonly MissionPickerOption[];
  meeting?: MeetingDetail;
  viewerId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [side, setSide] = React.useState<'bottom' | 'right'>('bottom');
  React.useEffect(() => {
    const query = window.matchMedia('(min-width: 640px)');
    const update = () => setSide(query.matches ? 'right' : 'bottom');
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const editing = Boolean(meeting);
  const [businessId, setBusinessId] = React.useState<string>(meeting?.businessId ?? '');
  // Active businesses, plus the meeting's own even if it was archived since.
  const businessChoices = businesses.filter((b) => !b.archived || b.id === meeting?.businessId);

  return (
    <>
      {editing ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}><PencilIcon aria-hidden="true" />Edit</Button>
      ) : (
        <Button type="button" onClick={() => setOpen(true)}><PlusIcon aria-hidden="true" />New meeting</Button>
      )}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side={side} className="gap-0 sm:w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{editing ? 'Edit meeting' : 'New meeting'}</SheetTitle>
            <SheetDescription>{editing ? 'Members are changed on the meeting page.' : 'Only its members and the managing director can see a meeting.'}</SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto px-5 pt-2 pb-6">
            <ExecutionForm
              action={editing ? editMeetingAction : createMeetingAction}
              scope={editing ? `meeting:edit:${meeting!.id}` : 'meeting:create'}
              className="grid gap-4"
              onSuccess={(result) => {
                setOpen(false);
                const id = (result.data as { id?: string } | undefined)?.id;
                if (!editing && id) router.push(`/meeting-points/${id}`);
              }}
            >
              {meeting ? <input type="hidden" name="meetingId" value={meeting.id} /> : null}
              <label className="field-label">Title
                <input name="title" required maxLength={200} defaultValue={meeting?.title ?? ''} placeholder="Weekly site review" className="field" data-autofocus />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="field-label">Date
                  <input type="date" name="meeting_date" required defaultValue={meeting?.date ?? today} className="field" />
                </label>
                <label className="field-label">Start time
                  <input type="time" name="start_time" defaultValue={meeting?.startTime ?? ''} className="field" />
                </label>
              </div>
              <MeetingTypeSelect defaultValue={meeting?.meetingType ?? null} required={false} />
              {businessChoices.length ? (
                <label className="field-label">Business
                  <select name="business_id" value={businessId} onChange={(event) => setBusinessId(event.target.value)} className="field">
                    <option value="">No business</option>
                    {businessChoices.map((b) => <option key={b.id} value={b.id}>{b.name}{b.archived ? ' (archived)' : ''}</option>)}
                  </select>
                </label>
              ) : null}
              {editing ? null : <MemberPicker members={members.filter((member) => member.id !== viewerId)} />}
              <MissionPicker options={missions} defaultValue={meeting?.missions.map((mission) => mission.id) ?? []} label="Linked missions" businessId={businessId || null} />
              <Button type="submit" className="justify-self-start">{editing ? 'Save meeting' : 'Create meeting'}</Button>
            </ExecutionForm>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/** Members of a new meeting (the creator is always one), with a search. */
function MemberPicker({ members }: { members: readonly MeetingMemberChoice[] }) {
  const [chosen, setChosen] = React.useState<string[]>([]);
  const [search, setSearch] = React.useState('');
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = members.filter((member) => words.every((word) => member.name.toLowerCase().includes(word)));
  return (
    <fieldset className="grid gap-2">
      <legend className="field-label mb-1">Members <span className="text-muted-foreground font-normal">(you are one)</span></legend>
      {chosen.map((id) => <input key={id} type="hidden" name="member" value={id} />)}
      <label className="relative block">
        <span className="sr-only">Search people</span>
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" aria-hidden="true" />
        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search people" className="field pl-9" autoComplete="off" />
      </label>
      <ul className="border-border max-h-48 overflow-y-auto rounded-xl border" aria-label="People">
        {shown.map((member) => (
          <li key={member.id}>
            <label className="hover:bg-muted/60 flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2 text-sm">
              <input type="checkbox" className="size-4" checked={chosen.includes(member.id)}
                onChange={() => setChosen((current) => (current.includes(member.id) ? current.filter((v) => v !== member.id) : [...current, member.id]))} />
              {member.name}
            </label>
          </li>
        ))}
        {shown.length === 0 ? <li className="text-muted-foreground px-3 py-3 text-sm">No one matches.</li> : null}
      </ul>
      {chosen.length ? <p className="text-muted-foreground text-xs">{chosen.length} chosen</p> : null}
    </fieldset>
  );
}
