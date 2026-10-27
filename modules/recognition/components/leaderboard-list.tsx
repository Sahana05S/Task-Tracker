import { TrophyIcon } from 'lucide-react';

import type { Board } from '@/modules/recognition/client';
import { Medal, type MedalTier } from '@/shared/ui/medal';
import { EmptyState, InitialsAvatar } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';

/** The top three places wear a medal; everyone else a plain figure. */
const PLACE_TIER: Record<number, MedalTier> = { 1: 'gold', 2: 'silver', 3: 'bronze' };

/** The figure a row's bar shows: the composite itself, or a factor's difference from the median. */
function barFigure(board: Board, row: Board['rows'][number]): number | null {
  const text = board.key === 'composite' ? row.value : row.delta;
  if (text === null) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

/**
 * Every ranked member, best first, with a bar either side of the team median
 * (zero): the viewer's bar in full violet, others lighter. Bars appear only
 * where the viewer may see the value; ranks are visible to everyone.
 */
export function LeaderboardList({ board, names, viewerId }: {
  board: Board;
  names: Record<string, string>;
  viewerId: string;
}) {
  if (!board.rows.length) {
    return <EmptyState title="No rankings yet">Rankings appear once the first day of the month has been recorded.</EmptyState>;
  }
  const figures = board.rows.map((row) => barFigure(board, row));
  const scale = Math.max(0, ...figures.map((f) => Math.abs(f ?? 0)));
  const valueLabel = board.key === 'composite' ? 'Score' : 'Value';
  return (
    <div className="soft-card soft-card-clip">
      <div aria-hidden="true" className="text-muted-foreground flex items-center gap-3 border-b px-4 py-2.5 text-xs font-semibold sm:px-5">
        <span className="w-10">Place</span>
        <span className="flex-1">Member</span>
        <span className="hidden w-40 text-center sm:block">vs team median</span>
        <span className="w-24 text-right sm:w-28">{board.key === 'composite' ? 'Score' : 'Value, vs median'}</span>
      </div>
      <ol>
        {board.rows.map((row, index) => {
          const you = row.userId === viewerId;
          const figure = figures[index];
          const width = figure === null || scale === 0 ? 0 : (Math.abs(figure) / scale) * 50;
          const name = names[row.userId] ?? 'Team member';
          return (
            <li
              key={row.userId}
              aria-current={you ? 'true' : undefined}
              className={cn('flex items-center gap-3 border-b px-4 py-2.5 last:border-b-0 sm:px-5', you && 'bg-primary-subtle/60')}
            >
              <span className={cn('flex w-10 items-center text-base font-bold tabular-nums', row.rank <= 3 ? 'text-foreground' : 'text-muted-foreground')}>
                <span className="sr-only">Place {row.rank}</span>
                {PLACE_TIER[row.rank] ? (
                  <Medal tier={PLACE_TIER[row.rank]} icon={TrophyIcon} number={row.rank} size="md" className="-ml-1" />
                ) : (
                  <span aria-hidden="true">{row.rank}</span>
                )}
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-2.5">
                <InitialsAvatar name={name} className="shrink-0" />
                <span className="text-foreground truncate text-sm font-medium">{name}</span>
                {you ? <span className="bg-primary text-primary-foreground shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold">You</span> : null}
              </span>
              <span aria-hidden="true" className="relative hidden h-3 w-40 sm:block">
                <span className="bg-chart-reference/70 absolute inset-y-[-3px] left-1/2 w-px" />
                {figure !== null && width > 0 ? (
                  <span
                    className={cn('absolute inset-y-0', you ? 'bg-chart-1' : 'bg-chart-3', figure > 0 ? 'left-1/2 rounded-r-[4px]' : 'right-1/2 rounded-l-[4px]')}
                    style={{ width: `${width}%` }}
                  />
                ) : null}
              </span>
              <span className="w-24 text-right text-sm tabular-nums sm:w-28">
                {row.value !== null ? (
                  <>
                    <span className="text-foreground font-semibold"><span className="sr-only">{valueLabel}: </span>{row.value}</span>
                    {row.delta !== null ? (
                      <span className="text-muted-foreground block text-[11px]">
                        {Number(row.delta) > 0 ? '+' : ''}{row.delta}<span className="sr-only"> compared with the team median</span>
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-muted-foreground" title="Shown to the member and managers">—<span className="sr-only">value private</span></span>
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
