'use client';

import * as React from 'react';
import { ListIcon, SlidersHorizontalIcon } from 'lucide-react';

import { PAY_COMPONENT_KIND_LABELS, PAY_COMPONENT_KINDS, type PayComponent, type PayComponentKind, type PayrollSetup } from '@/modules/payroll/client';
import { Button } from '@/shared/ui/button';
import { MissionNotice, MissionPanel } from '@/shared/ui/mission-ui';

import { formFields, usePayrollCommand } from './use-payroll-command';

/** Payroll rules the MD may change, and the component lists (the sheet's A_Options). */
export function PayrollSettings({ setup }: { setup: PayrollSetup }) {
  const { save, pending } = usePayrollCommand();
  const version = setup.settings.version;
  return (
    <>
      <MissionPanel icon={SlidersHorizontalIcon} title="Salary rules" subtitle="Used for draft months; a finalised month keeps the values it was finalised with.">
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void save('settings', version, formFields(event.currentTarget), 'Salary rules saved.');
          }}
        >
          <label className="field-label">
            Extra paid days per month
            <input name="extraPaidDays" required inputMode="decimal" defaultValue={setup.settings.extraPaidDays} className="field tabular" />
          </label>
          <label className="field-label">
            Full-day hours
            <input name="fullDayHours" required inputMode="decimal" defaultValue={setup.settings.fullDayHours} className="field tabular" />
          </label>
          <Button type="submit" disabled={pending}>Save</Button>
        </form>
        <MissionNotice className="mt-4">
          Days worked = full Present days + 0.75 × Under Hours Days (Present with fewer than the full-day hours) + 0.5 × Half Days.
          Calculated salary = monthly salary ÷ actual working days × (days worked + extra paid days), never more than the monthly salary.
        </MissionNotice>
      </MissionPanel>
      {PAY_COMPONENT_KINDS.map((kind) => (
        <ComponentList key={kind} kind={kind} components={setup.components.filter((c) => c.kind === kind)} version={version} />
      ))}
    </>
  );
}

const SUBTITLES: Record<PayComponentKind, string> = {
  fixed_deduction: 'Taken every month (Recurring Deposit, Provident Fund, Professional Tax, TDS…).',
  variable_deduction: 'Entered for a month (Mobile Bill, Late Login, Advance…). “Advance” repays salary advances.',
  incentive: 'Added to a month’s salary (Star Performer, Bonus…).',
};

function ComponentList({ kind, components, version }: { kind: PayComponentKind; components: PayComponent[]; version: number }) {
  const { save, pending } = usePayrollCommand();
  const addRef = React.useRef<HTMLFormElement>(null);
  return (
    <MissionPanel icon={ListIcon} title={`${PAY_COMPONENT_KIND_LABELS[kind]}s`} subtitle={SUBTITLES[kind]}>
      <ul className="divide-border divide-y">
        {components.map((c) => (
          <li key={c.id}>
            <form
              className="flex flex-wrap items-center gap-2 py-2"
              onSubmit={(event) => {
                event.preventDefault();
                const fields = formFields(event.currentTarget);
                void save('component', version, { id: c.id, name: fields.name, active: fields.active === 'on', sort: c.sort }, 'Component saved.');
              }}
            >
              <input name="name" defaultValue={c.name} required maxLength={60} aria-label="Name" className="field min-w-48 flex-1" />
              {c.isAdvanceRecovery ? <span className="text-muted-foreground text-xs">Repays advances</span> : null}
              <label className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" name="active" defaultChecked={c.active} />
                In use
              </label>
              <Button type="submit" variant="outline" size="sm" disabled={pending}>Save</Button>
            </form>
          </li>
        ))}
      </ul>
      <form
        ref={addRef}
        className="border-border mt-3 flex flex-wrap items-center gap-2 border-t pt-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const fields = formFields(event.currentTarget);
          if (await save('component', version, { kind, name: fields.name, active: true }, 'Component added.')) addRef.current?.reset();
        }}
      >
        <input name="name" required maxLength={60} placeholder="New component" aria-label="New component name" className="field min-w-48 flex-1" />
        <Button type="submit" size="sm" disabled={pending}>Add</Button>
      </form>
    </MissionPanel>
  );
}
