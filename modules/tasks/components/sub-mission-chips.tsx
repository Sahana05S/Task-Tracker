import Link from 'next/link';
import { RocketIcon } from 'lucide-react';

import { cn } from '@/shared/utils';

/** "Part of <tag>" on a sub-mission, linking to its parent mission. */
export function PartOfChip({ parentTag, className }: { parentTag: string; className?: string }) {
  return (
    <Link
      href={`/tasks/${encodeURIComponent(parentTag)}`}
      className={cn('badge-soft badge-neutral hover:text-primary whitespace-nowrap', className)}
      aria-label={`Sub-mission of ${parentTag}`}
    >
      <RocketIcon className="size-3" aria-hidden="true" />
      Part of {parentTag}
    </Link>
  );
}

/** How many sub-missions a mission has. */
export function SubMissionCount({ count, className }: { count: number; className?: string }) {
  return (
    <span className={cn('badge-soft badge-neutral whitespace-nowrap', className)}>
      <RocketIcon className="size-3" aria-hidden="true" />
      {count} sub-mission{count === 1 ? '' : 's'}
    </span>
  );
}
