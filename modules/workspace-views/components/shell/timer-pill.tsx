'use client';

import Link from 'next/link';
import { ChevronDownIcon, TimerIcon } from 'lucide-react';

import { useRunningTimers } from '@/modules/time-tracking/components/running-timer-context';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu';
import { RunningClock } from '@/shared/ui/running-clock';
import { cn } from '@/shared/utils';

const PILL = 'bg-success-subtle text-success-strong hover:bg-success-subtle/70 flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors max-md:min-h-10';

function Pulse() {
  return (
    <span className="relative flex size-2" aria-hidden="true">
      <span className="bg-success absolute inline-flex size-full motion-safe:animate-ping rounded-full opacity-60" />
      <span className="bg-success relative inline-flex size-2 rounded-full" />
    </span>
  );
}

/**
 * "Timer running" pill: keeps the user's running timers (from
 * `RunningTimerProvider`) one tap away from every page. One timer links to its
 * mission page, where it is stopped and logged, and shows the mission tag
 * rather than a ticking clock. Several timers may run at once (migration 118):
 * the pill then reads "2 timers running" and opens a list with a link to each.
 */
export function TimerPill({ compact = false }: { compact?: boolean }) {
  const timers = useRunningTimers();
  if (timers.length === 0) return null;
  if (timers.length === 1) {
    const timer = timers[0];
    return (
      <Link
        href={`/tasks/${encodeURIComponent(timer.taskTag)}`}
        title={`Timer running on ${timer.taskTag} · ${timer.taskTitle}`}
        className={cn(PILL, compact && 'px-2.5')}
      >
        <Pulse />
        <TimerIcon className="size-3.5" aria-hidden="true" />
        <span className={cn(compact && 'sr-only')}>Timer running</span>
        <span className="max-w-[9rem] truncate font-mono">{timer.taskTag}</span>
      </Link>
    );
  }
  const label = `${timers.length} timers running`;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className={cn(PILL, 'outline-none focus-visible:ring-ring focus-visible:ring-2', compact && 'px-2.5')} title={label}>
        <Pulse />
        <TimerIcon className="size-3.5" aria-hidden="true" />
        <span className={cn(compact && 'sr-only')}>{label}</span>
        {compact ? <span className="font-mono" aria-hidden="true">{timers.length}</span> : null}
        <ChevronDownIcon className="size-3.5" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-72">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {timers.map((timer) => (
          <DropdownMenuItem key={timer.id} asChild className="min-h-12 gap-3">
            <Link href={`/tasks/${encodeURIComponent(timer.taskTag)}`}>
              <TimerIcon className="text-success-strong size-4 shrink-0" aria-hidden="true" />
              <span className="grid min-w-0">
                <span className="truncate font-mono font-semibold">{timer.taskTag}</span>
                <span className="text-muted-foreground truncate text-xs">{timer.taskTitle}</span>
              </span>
              <span className="text-muted-foreground ml-auto text-xs tabular-nums"><RunningClock startedAt={timer.startedAt} /></span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
