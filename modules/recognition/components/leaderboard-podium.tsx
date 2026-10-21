import { CrownIcon } from 'lucide-react';
import type * as React from 'react';

import { podiumSteps, type BoardRow } from '@/modules/recognition/client';
import { InitialsAvatar } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';

/** Step look per place: height, tier colour and the column (2, 1, 3, centre highest). */
const STEP = {
  1: { height: 'h-28 sm:h-36', tone: 'from-tier-gold/90 to-tier-gold/55', text: 'text-recognition-foreground', col: 'col-start-2', rise: 2, label: 'First place' },
  2: { height: 'h-20 sm:h-28', tone: 'from-tier-silver/70 to-tier-silver/35', text: 'text-secondary-foreground', col: 'col-start-1', rise: 1, label: 'Second place' },
  3: { height: 'h-14 sm:h-20', tone: 'from-tier-bronze/75 to-tier-bronze/40', text: 'text-tier-bronze', col: 'col-start-3', rise: 0, label: 'Third place' },
} as const;

/**
 * The top three places as a stage. Exact ties share a step and stack on it.
 * Step heights mark the place, not the size of the lead; the figures beside
 * the names state the values.
 */
export function LeaderboardPodium({ rows, names, viewerId }: {
  rows: readonly BoardRow[];
  names: Record<string, string>;
  viewerId: string;
}) {
  const steps = podiumSteps(rows);
  if (!steps.length) return null;
  return (
    <section aria-label="Podium" className="soft-card relative overflow-hidden px-3 pt-6 sm:px-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-linear-180 from-[#fff6e3] via-[#f6f2fd] to-white" />
      <ol className="relative mx-auto grid max-w-2xl grid-cols-3 items-end gap-2 sm:gap-4">
        {steps.map(({ rank, rows: holders }) => {
          const step = STEP[rank as 1 | 2 | 3];
          return (
            <li key={rank} className={cn('row-start-1 flex min-w-0 flex-col items-center', step.col)}>
              <span className="sr-only">{step.label}{holders.length > 1 ? ' (shared)' : ''}: </span>
              <div className="flex min-w-0 flex-col items-center gap-1.5 pb-3">
                {rank === 1 ? <CrownIcon className="text-recognition size-6 fill-current sm:size-7" aria-hidden="true" /> : null}
                <span className="flex -space-x-3">
                  {holders.slice(0, 3).map((row) => (
                    <InitialsAvatar
                      key={row.userId}
                      name={names[row.userId] ?? 'Member'}
                      className={cn(
                        'size-11 text-sm ring-[3px] ring-white sm:size-14 sm:text-base',
                        row.userId === viewerId && 'ring-primary',
                        rank === 1 && 'anim-pop',
                      )}
                    />
                  ))}
                </span>
                {holders.map((row) => (
                  <span key={row.userId} className="flex max-w-full min-w-0 flex-col items-center text-center">
                    <span className="text-foreground max-w-full truncate text-xs font-semibold sm:text-sm">
                      {names[row.userId] ?? 'Team member'}
                      {row.userId === viewerId ? <span className="text-primary"> (you)</span> : null}
                    </span>
                    {row.value !== null ? <span className="text-muted-foreground text-xs tabular-nums">{row.value}</span> : null}
                  </span>
                ))}
              </div>
              <div
                aria-hidden="true"
                style={{ '--i': step.rise } as React.CSSProperties}
                className={cn('anim-podium flex w-full items-start justify-center rounded-t-2xl bg-linear-180 pt-2', step.height, step.tone)}
              >
                <span className={cn('text-2xl font-black tabular-nums sm:text-4xl', step.text)}>{rank}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
