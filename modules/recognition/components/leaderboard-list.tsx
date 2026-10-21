import { LockIcon, TriangleAlertIcon } from 'lucide-react';

import { BOARD_LABELS, type Board } from '@/modules/recognition/client';
import { GAP_SENTENCE, dataGaps, plainReason } from '@/modules/reports/client';
import { EmptyState, InitialsAvatar, MissionNotice } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';

/** The figure a row's bar shows: the composite itself, or a factor's difference from the median. */
function barFigure(board: Board, row: Board['rows'][number]): number | null {
  const text = board.key === 'composite' ? row.value : row.delta;
  if (text === null) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function reasonSentence(reasons: readonly string[]): string {
  const gaps = dataGaps(reasons).map((gap) => GAP_SENTENCE[gap]);
  if (gaps.length) return gaps.join(' ');
  const plain = [...new Set(reasons.map(plainReason))];
  return plain.length ? `${plain.join('. ')}.` : 'Required data is not available yet.';
}

/** Why a board has no ranking: the sales lock (pre-46 databases) or the engine's own reasons. */
export function LeaderboardBoardStatus({ board }: { board: Board }) {
  if (board.status === 'ready') return null;
  if (board.status === 'locked') {
    return (
      <MissionNotice tone="attention" icon={LockIcon} role="status">
        <p className="font-semibold">{BOARD_LABELS[board.key]} is locked</p>
        <p className="mt-0.5">Sales aren&apos;t connected in this workspace yet, so this ranking waits for them. The other factor boards work now.</p>
      </MissionNotice>
    );
  }
  return (
    <MissionNotice tone="attention" icon={TriangleAlertIcon} role="status">
      <p className="font-semibold">No one can be ranked on {BOARD_LABELS[board.key].toLowerCase()} yet</p>
      <p className="mt-0.5">{reasonSentence(board.reasons)}</p>
    </MissionNotice>
  );
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
    return board.status === 'ready' ? <EmptyState title="No one ranked yet">Rankings appear once the month has data.</EmptyState> : null;
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
              <span className={cn('w-10 text-base font-bold tabular-nums', row.rank <= 3 ? 'text-foreground' : 'text-muted-foreground')}>
                <span className="sr-only">Place </span>{row.rank}
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
      {board.unranked.length ? <Unranked board={board} names={names} /> : null}
    </div>
  );
}

function Unranked({ board, names }: { board: Board; names: Record<string, string> }) {
  return (
    <details className="border-t px-4 py-3 text-sm sm:px-5">
      <summary className="text-muted-foreground cursor-pointer font-medium">
        {board.unranked.length} not ranked on this board
      </summary>
      <ul className="mt-2 grid gap-1.5">
        {board.unranked.map((entry) => (
          <li key={entry.userId} className="flex flex-wrap gap-x-2">
            <span className="text-foreground font-medium">{names[entry.userId] ?? 'Team member'}</span>
            <span className="text-muted-foreground">
              {entry.reasons.length ? reasonSentence(entry.reasons) : 'Not ranked this month.'}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
