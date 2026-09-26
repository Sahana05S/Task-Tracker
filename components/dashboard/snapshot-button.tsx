'use client';

import * as React from 'react';
import { LoaderCircleIcon } from 'lucide-react';
import { toast } from 'sonner';

import { freezeMonthlySnapshot } from '@/app/dashboard/actions';
import { Button } from '@/components/ui/button';

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
 * unique key, so a month can be recomputed when late log entries arrive. The label
 * reflects which of the two it would be.
 *
 * Outcomes are reported by toast only. This control sits in the page header, where
 * an inline status line would push the whole page down.
 */
export function SnapshotButton({
  year,
  month,
  periodLabel,
  storedCount,
}: SnapshotButtonProps) {
  const [pending, startTransition] = React.useTransition();
  const alreadyStored = storedCount > 0;

  const run = () => {
    startTransition(async () => {
      const result = await freezeMonthlySnapshot(year, month);

      if (result.success && result.data) {
        const { memberCount, starPerformer } = result.data;
        toast.success(
          alreadyStored ? 'Snapshot recomputed' : 'Snapshot frozen',
          {
            description: `${memberCount} member ${
              memberCount === 1 ? 'row' : 'rows'
            } stored for ${result.data.periodLabel}${
              starPerformer ? `. Star performer: ${starPerformer}.` : '.'
            }`,
          },
        );
      } else {
        toast.error('Snapshot not stored', {
          description: result.error ?? 'Could not store the snapshot.',
        });
      }
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={run}
      disabled={pending}
      title={
        alreadyStored
          ? `${periodLabel} is already stored for ${storedCount} ${
              storedCount === 1 ? 'member' : 'members'
            }. Running again recomputes it.`
          : `Freeze ${periodLabel} statistics`
      }
    >
      {pending ? (
        <>
          <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
          Freezing
        </>
      ) : alreadyStored ? (
        'Recompute snapshot'
      ) : (
        'Freeze snapshot'
      )}
    </Button>
  );
}
