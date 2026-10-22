'use client';

import * as React from 'react';
import Link from 'next/link';

import { standingKey, standingTitle, type SetupMember } from '@/modules/tasks/internal/tools/month-setup';
import type { MonthSetupContext } from '@/modules/tasks/internal/tools/month-setup-commands';
import type { MonthSetupState } from '@/modules/tasks/components/month-setup/use-month-setup';
import { EmptyState } from '@/shared/ui/mission-ui';
import { CategoryBadge } from '@/shared/ui/tracker-badges';

const firstName = (member: SetupMember) => member.name.split(/\s+/)[0] || member.name;

/** First names, or full names where two members share one. */
function columnNames(members: readonly SetupMember[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const member of members) counts.set(firstName(member), (counts.get(firstName(member)) ?? 0) + 1);
  return new Map(members.map((member) => [member.id, (counts.get(firstName(member)) ?? 0) > 1 ? member.name : firstName(member)]));
}

/**
 * Standing missions × active members. Per-member rows tick a box per person;
 * single-owner rows pick one owner. Cells an earlier setup of this month
 * already created show as set up and cannot be ticked again.
 */
export function StandingGrid({ context, state }: { context: MonthSetupContext; state: MonthSetupState }) {
  const { members, standing } = context;
  const names = columnNames(members);
  if (standing.length === 0) {
    return (
      <EmptyState
        title="No standing missions yet"
        action={<Link href="/settings?tab=company#standing-missions" className="link text-sm">Add them in Settings › Company</Link>}
      >
        Standing missions are the ones every month repeats, such as Off Hours per member.
      </EmptyState>
    );
  }
  return (
    <div className="border-border overflow-x-auto rounded-xl border">
      <table className="sheet-grid w-full">
        <caption className="sr-only">Standing missions for each active member</caption>
        <thead>
          <tr>
            <th scope="col" className="sheet-grid-frozen min-w-56 text-left">Mission</th>
            {members.map((member) => (
              <th key={member.id} scope="col" className="min-w-20 text-center" title={member.name}>
                {names.get(member.id)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {standing.map((mission) => {
            const done = new Set(mission.setUp);
            const single = mission.ownerMode === 'single';
            const ticked = members.filter((member) => state.selection.standing.has(standingKey(mission.id, member.id)));
            const open = members.filter((member) => !done.has(member.id));
            // A single-owner row is on when it has its owner; a per-member row when everyone is ticked.
            const allOn = ticked.length > 0 && (single || ticked.length === open.length);
            const rowLabel = standingTitle(mission, context.month, single ? 'owner' : 'each member');
            const owner = state.ownerOf(mission.id) ?? open[0]?.id;
            return (
              <tr key={mission.id}>
                <th scope="row" className="sheet-grid-frozen text-left font-normal">
                  <label className="flex items-start gap-2.5">
                    <RowToggle
                      checked={allOn}
                      mixed={!single && ticked.length > 0 && !allOn}
                      disabled={open.length === 0 || (single && done.size > 0)}
                      label={`Include ${rowLabel}`}
                      onChange={(on) => state.setRow(mission.id, !on ? [] : single ? (owner ? [owner] : []) : open.map((m) => m.id))}
                    />
                    <span className="grid min-w-0 gap-0.5">
                      <span className="text-foreground text-sm font-medium">{rowLabel}</span>
                      <span className="flex items-center gap-1.5">
                        <CategoryBadge category={mission.category} />
                        <span className="text-muted-foreground text-xs">{single ? 'One owner' : 'Every member'}</span>
                      </span>
                    </span>
                  </label>
                </th>
                {members.map((member) => {
                  const key = standingKey(mission.id, member.id);
                  if (done.has(member.id)) {
                    return <td key={key} className="text-muted-foreground text-center text-xs">Set up</td>;
                  }
                  const label = `${standingTitle(mission, context.month, member.name)}${single ? ' (owner)' : ''}`;
                  return (
                    <td key={key} className="text-center">
                      <input
                        type={single ? 'radio' : 'checkbox'}
                        name={single ? `owner-${mission.id}` : undefined}
                        aria-label={label}
                        title={label}
                        disabled={single && done.size > 0}
                        checked={state.selection.standing.has(key)}
                        onChange={() => (single ? state.setRow(mission.id, [member.id]) : state.toggleCell(mission.id, member.id))}
                        className="accent-primary size-4 cursor-pointer align-middle"
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RowToggle({ checked, mixed, disabled, label, onChange }: {
  checked: boolean;
  mixed: boolean;
  disabled: boolean;
  label: string;
  onChange: (on: boolean) => void;
}) {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(event) => onChange(event.target.checked)}
      className="accent-primary mt-0.5 size-4 shrink-0 cursor-pointer"
    />
  );
}
