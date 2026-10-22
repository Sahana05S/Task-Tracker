import { AwardIcon } from 'lucide-react';

import { cn } from '@/shared/utils';

/**
 * A policy's commendation: the badge name on a bronze seal and its recognition
 * points. Bronze tier tokens, not the award gold, so commendations read as a
 * step below the ceremony's awards. Points never feed a performance score.
 */
export function BadgeSeal({ badge, points, size = 'sm', className }: { badge: string; points: number; size?: 'sm' | 'md'; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <span aria-hidden="true"
        className={cn('inline-flex shrink-0 items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--tier-bronze)_35%,transparent)] bg-(--tier-bronze-subtle) text-(--tier-bronze)',
          size === 'md' ? 'size-9' : 'size-6')}>
        <AwardIcon className={size === 'md' ? 'size-4.5' : 'size-3.5'} />
      </span>
      <span className="min-w-0">
        <span className={cn('text-foreground block truncate font-semibold', size === 'md' ? 'text-sm' : 'text-[13px]')}>{badge}</span>
        <span className="text-muted-foreground block text-xs tabular-nums">{points > 0 ? `${points} recognition points` : 'Badge only'}</span>
      </span>
    </span>
  );
}
