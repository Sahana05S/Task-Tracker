import Link from 'next/link';

import { BOARD_KEYS, BOARD_LABELS, type Board, type BoardKey } from '@/modules/recognition/client';
import { cn } from '@/shared/utils';

/**
 * One tab per board: the composite first, then the ten factors. Links keep the
 * month in the URL, so a tab is shareable. Boards that can never rank in this
 * workspace (sales not connected) are left out instead of shown locked.
 */
export function LeaderboardTabs({ boards, active, month }: {
  boards: Record<BoardKey, Pick<Board, 'status'>>;
  active: BoardKey;
  month: string;
}) {
  return (
    <nav aria-label="Leaderboard boards" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:px-0">
      <ul className="flex w-max gap-1.5 pb-1">
        {BOARD_KEYS.filter((key) => key === active || boards[key].status !== 'locked').map((key) => {
          const query = new URLSearchParams({ month, ...(key === 'composite' ? {} : { factor: key }) });
          return (
            <li key={key}>
              <Link
                href={`/leaderboard?${query.toString()}`}
                aria-current={key === active ? 'page' : undefined}
                scroll={false}
                className={cn('section-tab inline-flex items-center gap-1.5', key === active && 'section-tab-active', key === 'composite' && 'font-semibold')}
              >
                {BOARD_LABELS[key]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
