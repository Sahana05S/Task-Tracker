import Link from 'next/link';
import { LockIcon } from 'lucide-react';

import { BOARD_KEYS, BOARD_LABELS, type Board, type BoardKey } from '@/modules/recognition/client';
import { cn } from '@/shared/utils';

/**
 * One tab per board: the composite first, then the ten factors. Links keep the
 * month in the URL, so a tab is shareable; locked boards stay reachable and
 * say why on their own page.
 */
export function LeaderboardTabs({ boards, active, month }: {
  boards: Record<BoardKey, Pick<Board, 'status'>>;
  active: BoardKey;
  month: string;
}) {
  return (
    <nav aria-label="Leaderboard boards" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:px-0">
      <ul className="flex w-max gap-1.5 pb-1">
        {BOARD_KEYS.map((key) => {
          const locked = boards[key].status === 'locked';
          const query = new URLSearchParams({ month, ...(key === 'composite' ? {} : { factor: key }) });
          return (
            <li key={key}>
              <Link
                href={`/leaderboard?${query.toString()}`}
                aria-current={key === active ? 'page' : undefined}
                scroll={false}
                className={cn('section-tab inline-flex items-center gap-1.5', key === active && 'section-tab-active', key === 'composite' && 'font-semibold')}
              >
                {locked ? <LockIcon className="size-3.5" aria-hidden="true" /> : null}
                {BOARD_LABELS[key]}
                {locked ? <span className="sr-only"> (locked)</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
