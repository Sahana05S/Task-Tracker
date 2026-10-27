import { AwardIcon } from 'lucide-react';

import { Medal } from '@/shared/ui/medal';
import { cn } from '@/shared/utils';

const NUMBER = new Intl.NumberFormat('en-IN');

/** "1 recognition point", "1,000 recognition points", "Badge only". */
export function pointsLabel(points: number): string {
  return points > 0 ? `${NUMBER.format(points)} recognition ${points === 1 ? 'point' : 'points'}` : 'Badge only';
}

/**
 * A policy's commendation: the badge name on a bronze medal and its recognition
 * points. Bronze tier, not the award gold, so commendations read as a step
 * below the ceremony's awards. Points never feed a performance score.
 */
export function BadgeSeal({ badge, points, size = 'sm', className }: { badge: string; points: number; size?: 'sm' | 'md'; className?: string }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <Medal tier="bronze" icon={AwardIcon} size={size} />
      <span className="min-w-0">
        <span title={badge} className={cn('text-foreground block truncate font-semibold', size === 'md' ? 'text-sm' : 'text-[13px]')}>{badge}</span>
        <span className="text-muted-foreground block text-xs tabular-nums">{pointsLabel(points)}</span>
      </span>
    </span>
  );
}
