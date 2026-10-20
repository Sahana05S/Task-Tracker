import { cn } from '@/shared/utils';

import { CountUp } from './count-up';

/**
 * The streak flame (Duolingo-style): lit in ember orange while a streak is
 * alive, a grey outline when it is not. The count sits beside it and counts
 * up on mount. The flame is decorative; the caller's text states the fact.
 */
export function StreakFlame({ count, lit, size = 'lg', className }: {
  count: number; lit: boolean; size?: 'sm' | 'lg'; className?: string;
}) {
  const dimension = size === 'lg' ? 'size-16' : 'size-6';
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg
        viewBox="0 0 32 40"
        aria-hidden="true"
        className={cn(dimension, 'shrink-0', lit ? 'flame-flicker text-streak' : 'text-[#c9c4e3]')}
      >
        <path
          d="M16 1c1 6 5 9 8 13 3 4 6 8 6 13a14 14 0 0 1-28 0c0-5 2-8 4-11 1 4 3 6 5 6 1-6-1-12 5-21z"
          fill={lit ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={lit ? 0 : 2}
          strokeLinejoin="round"
        />
        {lit ? (
          <path
            className="flame-inner"
            d="M16 18c2 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-7 0 2 1 3 2 3 0-3-1-5 1-7z"
            fill="#fff3df"
          />
        ) : null}
      </svg>
      <span className={cn('font-bold tracking-tight tabular-nums', size === 'lg' ? 'text-5xl' : 'text-base', lit ? 'text-streak-foreground' : 'text-muted-foreground')}>
        <CountUp value={count} />
      </span>
    </span>
  );
}
