'use client';

import * as React from 'react';
import Link from 'next/link';
import { LoaderCircleIcon } from 'lucide-react';

import { POINT_MAX_LENGTH, type MeetingSummary } from '@/modules/support/client';
import { loadRecentMeetings, meetingPointAction } from '@/modules/support/meeting-actions';
import { Button } from '@/shared/ui/button';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { FormError } from '@/shared/ui/form-field';

/**
 * Quick Post's meeting point (migration 136): a point goes into one of the member's meetings of
 * the last 60 days (newest first), with who resolves it and when it is due.
 */
export function QuickMeetingPoint({ members, userId, autoFocus, onSaved }: {
  members: readonly { id: string; fullName: string; isActive: boolean }[];
  userId: string;
  autoFocus?: boolean;
  onSaved: () => void;
}) {
  const [meetings, setMeetings] = React.useState<MeetingSummary[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    loadRecentMeetings()
      .then((result) => {
        if (cancelled) return;
        if (result.success && result.data) setMeetings(result.data.filter((m) => m.members.some((member) => member.id === userId)));
        else setError(result.error ?? 'Your meetings could not be loaded.');
      })
      .catch(() => { if (!cancelled) setError('Your meetings could not be loaded. Close the drawer and try again.'); });
    return () => { cancelled = true; };
  }, [userId]);

  if (error) return <FormError message={error} />;
  if (!meetings) {
    return <p role="status" className="text-muted-foreground flex items-center gap-2 py-6 text-sm"><LoaderCircleIcon className="size-4 motion-safe:animate-spin" aria-hidden="true" />Loading your meetings…</p>;
  }
  if (!meetings.length) {
    return <p className="text-muted-foreground py-4 text-sm">You have no meetings in the last 60 days. <Link href="/meeting-points" className="link font-semibold">Start a meeting</Link> to add points to it.</p>;
  }
  return (
    <ExecutionForm action={meetingPointAction} scope="quick-post:meeting-point" className="grid gap-3" onSuccess={onSaved}>
      <input type="hidden" name="op" value="add" />
      <label className="field-label">Meeting
        <select name="meetingId" required defaultValue={meetings[0].id} className="field">
          {meetings.map((meeting) => <option key={meeting.id} value={meeting.id}>{meeting.date} · {meeting.title}</option>)}
        </select>
      </label>
      <label className="field-label">Point
        <textarea name="point" required maxLength={POINT_MAX_LENGTH} autoFocus={autoFocus} className="field min-h-20" placeholder="What needs doing or was decided" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="field-label">Owner
          <select name="owner_id" defaultValue={userId} className="field">
            <option value="">No owner yet</option>
            {members.filter((m) => m.isActive).map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
          </select>
        </label>
        <label className="field-label">Due<input type="date" name="resolution_due" className="field" /></label>
      </div>
      <Button type="submit" className="justify-self-start">Add meeting point</Button>
    </ExecutionForm>
  );
}
