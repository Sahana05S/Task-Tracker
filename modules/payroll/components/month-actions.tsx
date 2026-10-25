'use client';

import * as React from 'react';
import { DownloadIcon, LockIcon, LockOpenIcon } from 'lucide-react';

import { monthLabel, type PayrollMonth } from '@/modules/payroll/client';
import { Button, buttonVariants } from '@/shared/ui/button';

import { usePayrollCommand } from './use-payroll-command';

/**
 * Finalise (freeze this month's salary records, in hand rounded to the
 * rupee) or reopen a finalised month with a reason; plus the CSV export.
 */
export function MonthActions({ month, canFinalize }: { month: PayrollMonth; canFinalize: boolean }) {
  const { month: run, pending } = usePayrollCommand();
  const [reopening, setReopening] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const label = monthLabel(month.period);
  const exportHref = `/api/payroll/export?month=${month.period.slice(0, 7)}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={exportHref} className={buttonVariants({ variant: 'outline' })}>
        <DownloadIcon aria-hidden="true" />
        CSV
      </a>
      {month.state === 'draft' ? (
        <Button
          disabled={pending || !canFinalize}
          title={canFinalize ? undefined : 'A month can be finalised once it has started.'}
          onClick={() => {
            if (window.confirm(`Finalise ${label}? The salaries are saved as records and monthly entries for ${label} are locked until you reopen it.`)) {
              void run('finalize', month.period, month.version, null, `${label} finalised.`);
            }
          }}
        >
          <LockIcon aria-hidden="true" />
          Finalise {label}
        </Button>
      ) : reopening ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await run('reopen', month.period, month.version, reason.trim(), `${label} reopened.`)) {
              setReopening(false);
              setReason('');
            }
          }}
        >
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            autoFocus
            maxLength={500}
            placeholder="Why is it being reopened?"
            aria-label="Reason for reopening"
            className="field w-64"
          />
          <Button type="submit" variant="destructive" disabled={pending || reason.trim() === ''}>Reopen</Button>
          <Button type="button" variant="ghost" onClick={() => setReopening(false)}>Cancel</Button>
        </form>
      ) : (
        <Button variant="outline" onClick={() => setReopening(true)}>
          <LockOpenIcon aria-hidden="true" />
          Reopen
        </Button>
      )}
    </div>
  );
}
