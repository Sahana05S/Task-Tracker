'use client';

import * as React from 'react';
import { UserPlusIcon, XIcon } from 'lucide-react';

import type { MeetingPerson } from '@/modules/support/client';
import { meetingMemberAction, withdrawMeetingAction } from '@/modules/support/meeting-actions';
import { Button } from '@/shared/ui/button';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { InitialsAvatar } from '@/shared/ui/mission-ui';

/**
 * A meeting's members as chips. Any member adds someone (they then see the whole meeting); the
 * person who created it and the managing director remove members (never the last one).
 */
export function MeetingMembers({ meetingId, members, candidates, canEdit, canManage }: {
  meetingId: string;
  members: readonly MeetingPerson[];
  candidates: readonly { id: string; name: string }[];
  canEdit: boolean;
  canManage: boolean;
}) {
  const [adding, setAdding] = React.useState(false);
  const others = candidates.filter((person) => !members.some((member) => member.id === person.id));
  return (
    <div className="grid gap-2">
      <ul className="flex flex-wrap items-center gap-1.5" aria-label="Members">
        {members.map((member) => (
          <li key={member.id} className="bg-muted inline-flex min-h-8 items-center gap-1.5 rounded-full py-0.5 pr-2 pl-0.5 text-sm">
            <InitialsAvatar name={member.name} className="size-7 text-[10px]" />
            <span className={member.active ? 'text-foreground' : 'text-muted-foreground'}>{member.name}</span>
            {canManage && members.length > 1 ? (
              <ExecutionForm action={meetingMemberAction} scope={`meeting:remove:${meetingId}:${member.id}`} className="contents">
                <input type="hidden" name="op" value="remove_member" />
                <input type="hidden" name="meetingId" value={meetingId} />
                <input type="hidden" name="user_id" value={member.id} />
                <button type="submit" className="text-muted-foreground hover:text-danger -mr-1 grid size-6 place-items-center rounded-full" aria-label={`Remove ${member.name}`}>
                  <XIcon className="size-3.5" aria-hidden="true" />
                </button>
              </ExecutionForm>
            ) : null}
          </li>
        ))}
        {canEdit && others.length && !adding ? (
          <li><Button type="button" size="sm" variant="outline" shape="pill" onClick={() => setAdding(true)}><UserPlusIcon aria-hidden="true" />Add member</Button></li>
        ) : null}
      </ul>
      {adding ? (
        <ExecutionForm action={meetingMemberAction} scope={`meeting:add:${meetingId}`} onSuccess={() => setAdding(false)}>
          <input type="hidden" name="op" value="add_member" />
          <input type="hidden" name="meetingId" value={meetingId} />
          <div className="flex flex-wrap items-end gap-2">
            <label className="field-label min-w-0 flex-1">Add a member
              <select name="user_id" required defaultValue="" className="field">
                <option value="" disabled>Choose a person</option>
                {others.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </select>
            </label>
            <Button type="submit">Add</Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </ExecutionForm>
      ) : null}
    </div>
  );
}

/** Withdraw the meeting (its creator or the managing director). */
export function WithdrawMeeting({ meetingId }: { meetingId: string }) {
  return (
    <details className="disclosure">
      <summary className="text-danger">Withdraw meeting</summary>
      <ExecutionForm action={withdrawMeetingAction} scope={`meeting:withdraw:${meetingId}`} className="grid gap-2 pt-2">
        <input type="hidden" name="meetingId" value={meetingId} />
        <p className="text-muted-foreground text-sm">The meeting leaves every list. Its points and minutes stay in the history.</p>
        <Button type="submit" size="sm" variant="destructive" className="justify-self-start">Withdraw this meeting</Button>
      </ExecutionForm>
    </details>
  );
}
