'use client';

import * as React from 'react';
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  LoaderCircleIcon,
  LockIcon,
} from 'lucide-react';

import { freezeMonthlySnapshot } from '@/app/dashboard/actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface SnapshotButtonProps {
  year: number;
  month: number;
  periodLabel: string;
  /** How many member rows are already stored for this period. */
  storedCount: number;
}

/**
 * Freezes the month's statistics into `monthly_performance_snapshots`.
 *
 * Rendered only for managing directors by the dashboard. The Server Action
 * re-checks the role regardless, since a button's absence is not access control.
 *
 * Re-running is safe and is offered explicitly: the action upserts on the table's
 * unique key, so a month can be recomputed when late log entries arrive.
 */
export function SnapshotButton({
  year,
  month,
  periodLabel,
  storedCount,
}: SnapshotButtonProps) {
  const [message, setMessage] = React.useState<string | null>(null);
  const [isError, setIsError] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const run = () => {
    setMessage(null);
    setIsError(false);

    startTransition(async () => {
      const result = await freezeMonthlySnapshot(year, month);

      if (result.success && result.data) {
        const { memberCount, starPerformer } = result.data;
        setMessage(
          `Stored ${memberCount} member ${memberCount === 1 ? 'row' : 'rows'} for ${result.data.periodLabel}${
            starPerformer ? `. Star performer: ${starPerformer}.` : '.'
          }`,
        );
        setIsError(false);
      } else {
        setMessage(result.error ?? 'Could not store the snapshot.');
        setIsError(true);
      }
    });
  };

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Button type="button" variant="outline" size="sm" onClick={run} disabled={pending}>
        {pending ? (
          <>
            <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
            Freezing
          </>
        ) : (
          <>
            <LockIcon aria-hidden="true" />
            {storedCount > 0 ? 'Recompute snapshot' : 'Freeze snapshot'}
          </>
        )}
      </Button>

      {storedCount > 0 && message === null ? (
        <p className="text-xs text-slate-500">
          {periodLabel} already stored for {storedCount}{' '}
          {storedCount === 1 ? 'member' : 'members'}.
        </p>
      ) : null}

      {message ? (
        <p
          role="status"
          aria-live="polite"
          className={cn(
            'flex max-w-xs items-start gap-1.5 text-xs',
            isError ? 'text-rose-700' : 'text-emerald-700',
          )}
        >
          {isError ? (
            <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          )}
          {message}
        </p>
      ) : null}
    </div>
  );
}
