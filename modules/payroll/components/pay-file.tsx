'use client';

import * as React from 'react';
import {
  BanknoteIcon,
  CalendarClockIcon,
  EyeIcon,
  HandCoinsIcon,
  IdCardIcon,
  ReceiptTextIcon,
  RepeatIcon,
  TrendingUpIcon,
  Trash2Icon,
} from 'lucide-react';

import {
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_STATUSES,
  formatINR,
  maskAccountNumber,
  monthLabel,
  PAYMENT_MODE_LABELS,
  PAYMENT_MODES,
  type EmployeePayFile,
  type PayComponent,
  type PayrollEmployee,
} from '@/modules/payroll/client';
import { Button } from '@/shared/ui/button';
import { EmptyState, MissionNotice, MissionPanel, StatTile } from '@/shared/ui/mission-ui';

import { formFields, usePayrollCommand } from './use-payroll-command';

type Save = ReturnType<typeof usePayrollCommand>['save'];

const PayFileContext = React.createContext<{ file: EmployeePayFile; save: Save; pending: boolean } | null>(null);
function usePayFile() {
  const value = React.useContext(PayFileContext);
  if (!value) throw new Error('usePayFile outside PayFile');
  return value;
}

/** Submits a form's fields as one payroll command for this employee; resets the form on success. */
function useEntryForm(section: Parameters<Save>[0], message: string) {
  const { file, save } = usePayFile();
  return async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (await save(section, file.version, { ...formFields(form), userId: file.userId }, message)) form.reset();
  };
}

function RemoveButton({ entry, id, label }: { entry: 'revision' | 'fixed' | 'adjustment' | 'advance'; id: string; label: string }) {
  const { file, save, pending } = usePayFile();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-label={`Remove ${label}`}
      onClick={() => {
        if (window.confirm(`Remove ${label}? It is kept in the history but no longer counts.`)) {
          void save('withdraw', file.version, { userId: file.userId, entry, id }, 'Removed.');
        }
      }}
    >
      <Trash2Icon aria-hidden="true" />
    </Button>
  );
}

function ComponentOptions({ components }: { components: PayComponent[] }) {
  return components.map((c) => (
    <option key={c.id} value={c.id}>
      {c.name}
      {c.isAdvanceRecovery ? ' (repays advances)' : ''}
    </option>
  ));
}

const ROW = 'flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5';

/**
 * One employee's pay file: the sheet's EMP tab (fixed deductions, monthly
 * deductions, incentives, advances) plus their Employee Data profile and
 * salary history. Every save is checked again by `payroll_command`.
 */
export function PayFile({ file, components, employees }: { file: EmployeePayFile; components: PayComponent[]; employees: PayrollEmployee[] }) {
  const { save, pending } = usePayrollCommand();
  const period = file.period.slice(0, 7);
  const line = file.line;
  const active = components.filter((c) => c.active);
  const fixedComponents = active.filter((c) => c.kind === 'fixed_deduction');
  const monthlyComponents = active.filter((c) => c.kind !== 'fixed_deduction');
  const thisMonth = file.adjustments.filter((a) => a.period === file.period);
  const earlier = file.adjustments.filter((a) => a.period !== file.period);
  const advancesTaken = file.advances.reduce((sum, a) => sum + a.amount, 0);
  const recovered = file.adjustments.filter((a) => a.isAdvanceRecovery).reduce((sum, a) => sum + a.amount, 0);

  return (
    <PayFileContext.Provider value={{ file, save, pending }}>
      <MissionPanel icon={ReceiptTextIcon} title={`${monthLabel(file.period)} at a glance`} subtitle="Live until the month is finalised on Salary calculation.">
        {line === null ? (
          <MissionNotice tone="attention">Not on this month&apos;s payroll (no attendance and not active, or marked “not on payroll”).</MissionNotice>
        ) : (
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile label="Monthly salary" value={line.monthlySalary === null ? 'Not set' : formatINR(line.monthlySalary)} tone={line.monthlySalary === null ? 'alert' : 'default'} />
            <StatTile label="Days worked" value={line.daysWorked.toLocaleString('en-IN')} note={`${line.presentDays} P · ${line.udDays} UD · ${line.halfDays} H`} />
            <StatTile label="Fixed deductions" value={formatINR(line.fixedTotal)} />
            <StatTile label="This month's deductions" value={formatINR(line.variableTotal)} />
            <StatTile label="Incentives" value={formatINR(line.incentiveTotal)} />
            <StatTile label="Total deductions" value={formatINR(line.deductions)} note="Fixed + monthly − incentives" />
            <StatTile label="Calculated max" value={formatINR(line.calculated)} />
            <StatTile label="Capped" value={formatINR(line.capped)} />
            <StatTile label="In hand" value={formatINR(line.inHandRounded)} tone="success" />
            <StatTile label="Advance balance" value={formatINR(line.advanceBalance)} note={`${formatINR(line.advancesTaken)} taken − ${formatINR(line.advancesRecovered)} repaid`} />
          </dl>
        )}
      </MissionPanel>

      <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
        <ProfilePanel employees={employees} />
        <RevisionsPanel />
      </div>

      <MissionPanel icon={RepeatIcon} title="Fixed deductions" subtitle="Taken every month from the first month until the last (leave it empty to keep going).">
        {file.fixedDeductions.length === 0 ? (
          <EmptyState>No fixed deductions.</EmptyState>
        ) : (
          <ul className="divide-border divide-y">
            {file.fixedDeductions.map((f) => (
              <li key={f.id} className={ROW}>
                <span className="min-w-40 flex-1 font-medium">{f.component}</span>
                <span className="text-muted-foreground text-xs">
                  {monthLabel(f.effectiveFrom)} – {f.effectiveUntil ? monthLabel(f.effectiveUntil) : 'ongoing'}
                </span>
                <span className="tabular font-semibold">{formatINR(f.monthlyAmount)} / month</span>
                <RemoveButton entry="fixed" id={f.id} label={`${f.component} deduction`} />
              </li>
            ))}
          </ul>
        )}
        <FixedForm components={fixedComponents} period={period} />
      </MissionPanel>

      <MissionPanel icon={TrendingUpIcon} title={`Deductions and incentives for ${monthLabel(file.period)}`} subtitle="Monthly deductions lower the salary; incentives raise it. “Advance” repays salary advances.">
        {thisMonth.length === 0 ? (
          <EmptyState>Nothing entered for this month.</EmptyState>
        ) : (
          <ul className="divide-border divide-y">
            {thisMonth.map((a) => (
              <li key={a.id} className={ROW}>
                <span className="min-w-40 flex-1 font-medium">
                  {a.component}
                  {a.note ? <span className="text-muted-foreground block text-xs font-normal">{a.note}</span> : null}
                </span>
                <span className={a.kind === 'incentive' ? 'tabular text-success-strong font-semibold' : 'tabular font-semibold'}>
                  {a.kind === 'incentive' ? '+' : '−'} {formatINR(a.amount)}
                </span>
                <RemoveButton entry="adjustment" id={a.id} label={`${a.component} entry`} />
              </li>
            ))}
          </ul>
        )}
        <AdjustmentForm components={monthlyComponents} period={period} />
        {earlier.length > 0 ? (
          <details className="mt-4">
            <summary className="text-primary cursor-pointer text-sm font-medium">Other months ({earlier.length})</summary>
            <ul className="divide-border mt-2 divide-y text-sm">
              {earlier.map((a) => (
                <li key={a.id} className={ROW}>
                  <span className="text-muted-foreground w-32 text-xs">{monthLabel(a.period)}</span>
                  <span className="min-w-40 flex-1">{a.component}{a.note ? ` · ${a.note}` : ''}</span>
                  <span className="tabular">{a.kind === 'incentive' ? '+' : '−'} {formatINR(a.amount)}</span>
                  <RemoveButton entry="adjustment" id={a.id} label={`${a.component} entry for ${monthLabel(a.period)}`} />
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </MissionPanel>

      <MissionPanel icon={HandCoinsIcon} title="Advances" subtitle="Money paid ahead of salary. Repay it with “Advance” monthly deductions.">
        <dl className="mb-4 grid grid-cols-3 gap-2">
          <StatTile label="Taken" value={formatINR(advancesTaken)} />
          <StatTile label="Repaid" value={formatINR(recovered)} />
          <StatTile label="Balance" value={formatINR(advancesTaken - recovered)} tone={advancesTaken - recovered > 0 ? 'alert' : 'default'} />
        </dl>
        {file.advances.length === 0 ? (
          <EmptyState>No advances.</EmptyState>
        ) : (
          <ul className="divide-border divide-y">
            {file.advances.map((a) => (
              <li key={a.id} className={ROW}>
                <span className="text-muted-foreground tabular w-28 text-xs">{a.paidOn}</span>
                <span className="min-w-40 flex-1">{a.reason}</span>
                <span className="tabular font-semibold">{formatINR(a.amount)}</span>
                <RemoveButton entry="advance" id={a.id} label={`advance of ${formatINR(a.amount)}`} />
              </li>
            ))}
          </ul>
        )}
        <AdvanceForm />
      </MissionPanel>

      <MissionPanel icon={CalendarClockIcon} title="Salary records" subtitle="Finalised months, as paid.">
        {file.records.length === 0 ? (
          <EmptyState>No finalised months yet.</EmptyState>
        ) : (
          <ul className="divide-border divide-y">
            {file.records.map((r) => (
              <li key={`${r.period}-${r.revision}`} className={ROW}>
                <span className="min-w-40 flex-1 font-medium">{monthLabel(r.period)}</span>
                <span className="text-muted-foreground text-xs">{r.daysWorked.toLocaleString('en-IN')} days · salary {formatINR(r.monthlySalary)} · deductions {formatINR(r.deductions)}</span>
                <span className="tabular font-semibold">{formatINR(r.inHandRounded)}</span>
              </li>
            ))}
          </ul>
        )}
      </MissionPanel>
    </PayFileContext.Provider>
  );
}

function ProfilePanel({ employees }: { employees: PayrollEmployee[] }) {
  const { file, pending } = usePayFile();
  const submit = useEntryForm('profile', 'Profile saved.');
  const [reveal, setReveal] = React.useState(false);
  const p = file.profile;
  return (
    <MissionPanel icon={IdCardIcon} title="Employment details" subtitle="From the sheet's Employee Data. Designation and supervisor are set in Team.">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <label className="field-label">
          Joining date
          <input type="date" name="joiningDate" defaultValue={p.joiningDate ?? ''} className="field" />
        </label>
        <label className="field-label">
          Employment status
          <select name="employmentStatus" defaultValue={p.employmentStatus} className="field">
            {EMPLOYMENT_STATUSES.map((s) => <option key={s} value={s}>{EMPLOYMENT_STATUS_LABELS[s]}</option>)}
          </select>
        </label>
        <label className="field-label">
          Salary payment mode
          <select name="paymentMode" defaultValue={p.paymentMode ?? ''} className="field">
            <option value="">Not set</option>
            {PAYMENT_MODES.map((m) => <option key={m} value={m}>{PAYMENT_MODE_LABELS[m]}</option>)}
          </select>
        </label>
        <label className="field-label">
          <span className="flex items-center justify-between">
            Account number
            {p.accountNumber ? (
              <button type="button" onClick={() => setReveal((v) => !v)} className="text-primary inline-flex items-center gap-1 text-xs">
                <EyeIcon className="size-3.5" aria-hidden="true" />
                {reveal ? 'Hide' : 'Show'}
              </button>
            ) : null}
          </span>
          {reveal || !p.accountNumber ? (
            <input name="accountNumber" defaultValue={p.accountNumber ?? ''} maxLength={34} autoComplete="off" className="field font-mono" />
          ) : (
            <>
              <input type="hidden" name="accountNumber" value={p.accountNumber} />
              <span className="field tabular flex items-center">{maskAccountNumber(p.accountNumber)}</span>
            </>
          )}
        </label>
        <label className="field-label">
          Salary handler
          <select name="salaryHandlerId" defaultValue={p.salaryHandlerId ?? ''} className="field">
            <option value="">Not set</option>
            {employees.filter((e) => e.isActive).map((e) => <option key={e.userId} value={e.userId}>{e.fullName}</option>)}
          </select>
        </label>
        <label className="field-label sm:col-span-2">
          Notes
          <textarea name="notes" defaultValue={p.notes} maxLength={1000} rows={2} className="field" />
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>Save details</Button>
        </div>
      </form>
    </MissionPanel>
  );
}

function RevisionsPanel() {
  const { file, pending } = usePayFile();
  const submit = useEntryForm('revision', 'Salary saved.');
  return (
    <MissionPanel icon={BanknoteIcon} title="Monthly salary" subtitle="Each salary applies from its month until the next one. Saving the same month replaces it.">
      {file.revisions.length === 0 ? (
        <MissionNotice tone="attention">No salary yet. Salary calculation shows “Salary not set” until one is added.</MissionNotice>
      ) : (
        <ul className="divide-border divide-y">
          {file.revisions.map((r) => (
            <li key={r.id} className={ROW}>
              <span className="min-w-32 flex-1 font-medium">From {monthLabel(r.effectiveFrom)}</span>
              {r.note ? <span className="text-muted-foreground text-xs">{r.note}</span> : null}
              <span className="tabular font-semibold">{formatINR(r.monthlySalary)}</span>
              <RemoveButton entry="revision" id={r.id} label={`salary from ${monthLabel(r.effectiveFrom)}`} />
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="border-border mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2">
        <label className="field-label">
          From month
          <input type="month" name="effectiveFrom" required defaultValue={file.period.slice(0, 7)} className="field" />
        </label>
        <label className="field-label">
          Monthly salary (₹)
          <input name="monthlySalary" required inputMode="decimal" placeholder="25000" className="field tabular" />
        </label>
        <label className="field-label sm:col-span-2">
          Note (optional)
          <input name="note" maxLength={200} placeholder="Annual revision" className="field" />
        </label>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>Add salary</Button>
        </div>
      </form>
    </MissionPanel>
  );
}

function FixedForm({ components, period }: { components: PayComponent[]; period: string }) {
  const { pending } = usePayFile();
  const submit = useEntryForm('fixed', 'Fixed deduction saved.');
  return (
    <form onSubmit={submit} className="border-border mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr_auto] lg:items-end">
      <label className="field-label">
        Deduction
        <select name="componentId" required className="field">
          <ComponentOptions components={components} />
        </select>
      </label>
      <label className="field-label">
        Per month (₹)
        <input name="monthlyAmount" required inputMode="decimal" className="field tabular" />
      </label>
      <label className="field-label">
        First month
        <input type="month" name="effectiveFrom" required defaultValue={period} className="field" />
      </label>
      <label className="field-label">
        Last month (optional)
        <input type="month" name="effectiveUntil" className="field" />
      </label>
      <Button type="submit" disabled={pending || components.length === 0}>Add</Button>
    </form>
  );
}

function AdjustmentForm({ components, period }: { components: PayComponent[]; period: string }) {
  const { pending } = usePayFile();
  const submit = useEntryForm('adjustment', 'Entry saved.');
  const deductions = components.filter((c) => c.kind === 'variable_deduction');
  const incentives = components.filter((c) => c.kind === 'incentive');
  return (
    <form onSubmit={submit} className="border-border mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-[1fr_1.5fr_1fr_1.5fr_auto] lg:items-end">
      <label className="field-label">
        Month
        <input type="month" name="period" required defaultValue={period} className="field" />
      </label>
      <label className="field-label">
        Component
        <select name="componentId" required className="field">
          <optgroup label="Deductions"><ComponentOptions components={deductions} /></optgroup>
          <optgroup label="Incentives"><ComponentOptions components={incentives} /></optgroup>
        </select>
      </label>
      <label className="field-label">
        Amount (₹)
        <input name="amount" required inputMode="decimal" className="field tabular" />
      </label>
      <label className="field-label">
        Note (optional)
        <input name="note" maxLength={200} className="field" />
      </label>
      <Button type="submit" disabled={pending || components.length === 0}>Add</Button>
    </form>
  );
}

function AdvanceForm() {
  const { pending } = usePayFile();
  const submit = useEntryForm('advance', 'Advance saved.');
  return (
    <form onSubmit={submit} className="border-border mt-4 grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-[1fr_2fr_1fr_auto] lg:items-end">
      <label className="field-label">
        Date paid
        <input type="date" name="paidOn" required className="field" />
      </label>
      <label className="field-label">
        Reason
        <input name="reason" required maxLength={200} placeholder="Medical, personal…" className="field" />
      </label>
      <label className="field-label">
        Amount (₹)
        <input name="amount" required inputMode="decimal" className="field tabular" />
      </label>
      <Button type="submit" disabled={pending}>Add advance</Button>
    </form>
  );
}
