import { InfinityIcon } from 'lucide-react';

import { cn } from '@/shared/utils';

/**
 * Marks a permanent mission (migration 135): always on, no due date, never
 * Done. Shown on mission cards and the mission page.
 */
export function PermanentBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'bg-primary-subtle text-primary-subtle-foreground inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        className,
      )}
      title="Always on: no due date, never marked Done"
    >
      <InfinityIcon className="size-3" aria-hidden="true" />
      Permanent
    </span>
  );
}
