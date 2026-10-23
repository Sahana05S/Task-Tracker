import { CircleCheckIcon, CircleDashedIcon } from 'lucide-react';

import { cn } from '@/shared/utils';
import type { ChecklistRollup } from '../internal/progress';
import { checklistGate } from '../internal/table';

/**
 * OPEN / CLOSED beside a progress figure, as on the sheet's Checklist Home:
 * progress follows Activity, but the checklist closes only when Setup,
 * Activity and Closure are all complete or N/A.
 */
export function ChecklistGateBadge({ rollup, className }: { rollup: Pick<ChecklistRollup, 'sections' | 'isComplete' | 'errors'>; className?: string }) {
  const gate = checklistGate(rollup);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        gate.closed ? 'bg-success-subtle text-success-strong' : 'bg-attention-subtle text-attention-foreground',
        className,
      )}
    >
      {gate.closed ? <CircleCheckIcon className="size-3.5" aria-hidden="true" /> : <CircleDashedIcon className="size-3.5" aria-hidden="true" />}
      {gate.label}
    </span>
  );
}
