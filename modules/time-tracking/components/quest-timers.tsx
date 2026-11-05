import Link from 'next/link';
import { FlagIcon } from 'lucide-react';

import { TimerButton } from '@/modules/time-tracking/components/timer-button';
import { formatElapsed } from '@/modules/time-tracking/internal/timers/elapsed';
import { questTree, type QuestTime } from '@/modules/time-tracking/internal/timers/quest-time-types';

/**
 * A mission's Quests with their logged time and a Start/Stop for each
 * (migration 123). A mission with Quests is timed on its Quests; each Quest's
 * figure includes its sub-Quests. Server-safe: the buttons are the client
 * `TimerButton`, keyed by mission and Quest.
 */
export function QuestTimerList({
  taskId,
  taskTag,
  quests,
  canTime,
  questHref,
}: {
  taskId: string;
  taskTag: string;
  quests: readonly QuestTime[];
  /** The viewer is Crew or a manager and the mission is open. */
  canTime: boolean;
  /** Each Quest's home in the checklist. */
  questHref: (quest: QuestTime) => string;
}) {
  const tree = questTree(quests);
  return (
    <div className="grid gap-2">
      <p className="text-muted-foreground text-xs">
        This mission is timed on its Quests. Several people can time one Quest, and you can time several Quests at once; your day&rsquo;s hours count overlapping time once.
      </p>
      <ul className="grid gap-1.5" aria-label="Quest timers">
        {tree.map(({ quest, depth }) => (
          <li
            key={quest.nodeId}
            className="bg-muted/60 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm"
            style={depth ? { marginInlineStart: `${Math.min(depth, 4) * 0.875}rem` } : undefined}
          >
            <span className="grid min-w-0 flex-1 basis-36">
              <Link href={questHref(quest)} className="text-foreground inline-flex min-w-0 items-center gap-1.5 font-semibold hover:underline">
                <FlagIcon className="text-primary size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{quest.title}</span>
              </Link>
              <span className="text-muted-foreground text-xs tabular-nums">
                {formatElapsed(quest.totalSeconds)} logged
                {quest.totalSeconds !== quest.ownSeconds ? ` · ${formatElapsed(quest.ownSeconds)} on the Quest itself` : ''}
              </span>
            </span>
            {canTime ? <TimerButton taskId={taskId} taskLabel={taskTag} nodeId={quest.nodeId} questTitle={quest.title} compact /> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
