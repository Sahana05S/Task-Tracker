import Link from 'next/link';
import { TimerIcon } from 'lucide-react';

import type { RunningTimer } from '@/lib/layout/running-timers';
import { cn } from '@/shared/utils';

/**
 * "Timer running" pill: keeps any running timer one tap away from every page.
 * Links to the mission page, where the timer is stopped and logged. Shows the
 * mission tag rather than a ticking clock, so it never displays a time the
 * server has not recorded.
 */
export function TimerPill({ timers, compact = false }: { timers: readonly RunningTimer[]; compact?: boolean }) {
  if (timers.length === 0) return null;
  const first = timers[0];
  const label = timers.length === 1 ? first.taskTag : `${timers.length} timers`;
  return (
    <Link
      href={`/tasks/${encodeURIComponent(first.taskTag)}`}
      title={timers.length === 1 ? `Timer running on ${first.taskTag} · ${first.taskTitle}` : `${timers.length} timers running`}
      className={cn(
        'bg-success-subtle text-success-strong hover:bg-success-subtle/70 flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
        compact && 'px-2.5',
      )}
    >
      <span className="relative flex size-2" aria-hidden="true">
        <span className="bg-success absolute inline-flex size-full animate-ping rounded-full opacity-60" />
        <span className="bg-success relative inline-flex size-2 rounded-full" />
      </span>
      <TimerIcon className="size-3.5" aria-hidden="true" />
      <span className={cn(compact && 'sr-only')}>Timer running</span>
      <span className="max-w-[9rem] truncate font-mono">{label}</span>
    </Link>
  );
}
