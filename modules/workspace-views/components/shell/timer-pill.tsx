'use client';

import Link from 'next/link';
import { TimerIcon } from 'lucide-react';

import { useRunningTimer } from '@/modules/time-tracking/components/running-timer-context';
import { cn } from '@/shared/utils';

/**
 * "Timer running" pill: keeps the user's running timer (one per user, from
 * `RunningTimerProvider`) one tap away from every page.
 * Links to the mission page, where the timer is stopped and logged. Shows the
 * mission tag rather than a ticking clock, so it never displays a time the
 * server has not recorded.
 */
export function TimerPill({ compact = false }: { compact?: boolean }) {
  const timer = useRunningTimer();
  if (!timer) return null;
  return (
    <Link
      href={`/tasks/${encodeURIComponent(timer.taskTag)}`}
      title={`Timer running on ${timer.taskTag} · ${timer.taskTitle}`}
      className={cn(
        'bg-success-subtle text-success-strong hover:bg-success-subtle/70 flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
        compact && 'px-2.5',
      )}
    >
      <span className="relative flex size-2" aria-hidden="true">
        <span className="bg-success absolute inline-flex size-full motion-safe:animate-ping rounded-full opacity-60" />
        <span className="bg-success relative inline-flex size-2 rounded-full" />
      </span>
      <TimerIcon className="size-3.5" aria-hidden="true" />
      <span className={cn(compact && 'sr-only')}>Timer running</span>
      <span className="max-w-[9rem] truncate font-mono">{timer.taskTag}</span>
    </Link>
  );
}
