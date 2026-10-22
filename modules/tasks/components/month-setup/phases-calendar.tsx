'use client';

import { phaseRange, phaseTitle, type Phase } from '@/modules/tasks/internal/tools/month-setup';
import type { MonthSetupContext } from '@/modules/tasks/internal/tools/month-setup-commands';
import type { MonthSetupState } from '@/modules/tasks/components/month-setup/use-month-setup';
import { Field } from '@/shared/ui/form-field';
import { MissionNotice } from '@/shared/ui/mission-ui';
import { NativeSelect } from '@/shared/ui/native-select';
import { cn } from '@/shared/utils';

const day = (iso: string) => Number(iso.slice(8, 10));

/**
 * Weekly Tasks Review phases: one row per phase, seven days from the 1st, so
 * the clipped last week is visible as a short row.
 */
export function PhasesCalendar({ context, state }: { context: MonthSetupContext; state: MonthSetupState }) {
  const owner = state.selection.phasesOwnerId;
  if (context.phasesSetUp.length > 0) {
    return (
      <MissionNotice tone="info" role="status">
        The weekly phases for this month are already set up.
      </MissionNotice>
    );
  }
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,16rem)] sm:items-end">
        <label className="flex items-center gap-2.5 text-sm font-medium">
          <input
            type="checkbox"
            checked={owner !== null}
            onChange={(event) => state.setPhasesOwner(event.target.checked ? context.directorId ?? context.members[0]?.id ?? null : null)}
            className="accent-primary size-4"
          />
          Create {state.phases.length} weekly Tasks Review phases
        </label>
        <Field id="phases-owner" label="Owner" hint="Defaults to the managing director.">
          <NativeSelect
            id="phases-owner"
            value={owner ?? ''}
            disabled={owner === null}
            onChange={(event) => state.setPhasesOwner(event.target.value)}
          >
            {owner === null ? <option value="">Not created</option> : null}
            {context.members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </NativeSelect>
        </Field>
      </div>

      <ol className={cn('grid gap-2', owner === null && 'opacity-50')} aria-label={`Weekly phases of ${context.month}`}>
        {state.phases.map((phase) => <PhaseRow key={phase.week} phase={phase} month={context.month} />)}
      </ol>
    </div>
  );
}

function PhaseRow({ phase, month }: { phase: Phase; month: string }) {
  const days = Array.from({ length: day(phase.end) - day(phase.start) + 1 }, (_, i) => day(phase.start) + i);
  return (
    <li className="grid items-center gap-x-4 gap-y-1.5 sm:grid-cols-[11rem_1fr]">
      <div className="min-w-0">
        <p className="text-foreground text-sm font-medium">Week {phase.week}</p>
        <p className="text-muted-foreground text-xs tabular-nums">{phaseRange(phase)}</p>
      </div>
      <div className="grid grid-cols-7 gap-1" title={phaseTitle(month, phase.week)}>
        {days.map((d) => (
          <span
            key={d}
            className="bg-primary-subtle text-primary-subtle-foreground grid h-8 place-items-center rounded-md text-xs font-medium tabular-nums"
          >
            {d}
          </span>
        ))}
      </div>
    </li>
  );
}
