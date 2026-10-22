'use client';

import { TimerIcon } from 'lucide-react';

import { monthBounds, monthOf, swapMonthInTitle, type PreviousAction } from '@/modules/tasks/internal/tools/month-setup';
import type { MonthSetupContext } from '@/modules/tasks/internal/tools/month-setup-commands';
import type { MonthSetupState } from '@/modules/tasks/components/month-setup/use-month-setup';
import { Field } from '@/shared/ui/form-field';
import { EmptyState, MissionNotice } from '@/shared/ui/mission-ui';
import { NativeSelect } from '@/shared/ui/native-select';
import { formatDate } from '@/shared/tracker/format';
import { codeLabel } from '@/shared/tracker/labels';

/**
 * Last month's missions (and older ones still open) that the standing list and
 * weekly phases do not already recreate, each with Repeat as new, Carry over
 * remaining or Skip.
 */
export function PreviousMissions({ context, state }: { context: MonthSetupContext; state: MonthSetupState }) {
  const hidden = context.previous.length - state.rows.length;
  const first = monthBounds(context.month);
  const startsOn = new Date(`${first.start}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const anyCarry = state.rows.some(({ mission }) => state.selection.previous.get(mission.id) === 'carryover');

  if (state.rows.length === 0) {
    return (
      <EmptyState title="Nothing to bring forward">
        {hidden > 0 ? `${hidden} earlier missions are recreated by the standing list or the weekly phases.` : 'No earlier missions are open.'}
      </EmptyState>
    );
  }
  return (
    <div className="grid gap-4">
      {!state.carry ? (
        <MissionNotice tone="attention" role="note">
          Carry over moves the unfinished part into the new month and archives the old mission, so it is available from {startsOn}.
          Open this wizard again then to carry missions over; Repeat as new works now.
        </MissionNotice>
      ) : null}
      {hidden > 0 ? (
        <p className="text-muted-foreground text-xs">
          {hidden} more {hidden === 1 ? 'mission is' : 'missions are'} hidden: the standing list or the weekly phases recreate {hidden === 1 ? 'it' : 'them'}.
        </p>
      ) : null}
      {context.previousTruncated ? (
        <p className="text-muted-foreground text-xs">Showing the 200 most recent earlier missions.</p>
      ) : null}

      <div className="border-border overflow-x-auto rounded-xl border">
        <table className="sheet-grid w-full">
          <caption className="sr-only">Earlier missions and what happens to each</caption>
          <thead>
            <tr>
              <th scope="col" className="min-w-60 text-left">Mission</th>
              <th scope="col" className="text-left">Status</th>
              <th scope="col" className="text-right">Progress</th>
              <th scope="col" className="min-w-52 text-left">In {first.name}</th>
            </tr>
          </thead>
          <tbody>
            {state.rows.map(({ mission }) => {
              const action = state.selection.previous.get(mission.id) ?? 'skip';
              const repeatTitle = swapMonthInTitle(mission.title, monthOf(mission.assignedDate), context.month);
              const id = `previous-${mission.id}`;
              return (
                <tr key={mission.id}>
                  <td>
                    <span className="task-tag">{mission.taskTag}</span>
                    <span className="text-foreground block text-sm">{mission.title}</span>
                    <span className="text-muted-foreground block text-xs">
                      {mission.assigneeNames.join(', ') || 'Unassigned'} · {formatDate(mission.assignedDate)}
                    </span>
                  </td>
                  <td className="text-xs whitespace-nowrap">
                    {codeLabel(mission.status)}
                    {mission.runningTimer ? (
                      <span className="text-attention-foreground mt-1 flex items-center gap-1">
                        <TimerIcon className="size-3.5" aria-hidden="true" /> Timer running
                      </span>
                    ) : null}
                  </td>
                  <td className="text-right text-xs tabular-nums">{mission.progress === null ? '—' : `${mission.progress}%`}</td>
                  <td>
                    <label htmlFor={id} className="sr-only">What happens to {mission.taskTag} in {first.name}</label>
                    <NativeSelect
                      id={id}
                      value={action}
                      onChange={(event) => state.setAction(mission.id, event.target.value as PreviousAction)}
                      className="h-9 py-1 text-sm"
                    >
                      <option value="repeat">Repeat as new</option>
                      <option value="carryover">{state.carry ? 'Carry over remaining' : `Carry over from ${startsOn}`}</option>
                      <option value="skip">Skip</option>
                    </NativeSelect>
                    {action === 'repeat' && repeatTitle !== mission.title ? (
                      <span className="text-muted-foreground mt-1 block text-xs">As “{repeatTitle}”</span>
                    ) : null}
                    {action === 'carryover' && !state.carry ? (
                      <span className="text-muted-foreground mt-1 block text-xs">Not part of this setup</span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {anyCarry && state.carry ? (
        <Field id="carryover-reason" label="Carry-over reason" hint="Kept with each archived mission. Leave blank for the standard wording.">
          <textarea
            id="carryover-reason"
            maxLength={1000}
            rows={2}
            className="field w-full"
            value={state.selection.reason}
            onChange={(event) => state.setReason(event.target.value)}
            placeholder={`Carried over by the ${first.label} month setup`}
          />
        </Field>
      ) : null}
    </div>
  );
}
