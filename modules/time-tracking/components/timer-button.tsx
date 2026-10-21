'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PlayIcon, SquareIcon } from 'lucide-react';
import { toast } from 'sonner';

import { RunningClock } from '@/shared/ui/running-clock';
import { useRunningTimer } from '@/modules/time-tracking/components/running-timer-context';
import { computeElapsedSeconds, formatElapsed } from '@/modules/time-tracking/internal/timers/elapsed';
import type { RunningTimer } from '@/modules/time-tracking/internal/timers/running-timers';
import { startTaskTimer, stopTaskTimer } from '@/modules/time-tracking/timer-actions';
import { prepareOperation } from '@/shared/commands/client-operation';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/utils';

export interface TimerButtonProps {
  /** The mission this button times. */
  taskId: string;
  /** Names the mission in the accessible label, e.g. its tag; needed where several buttons share a page. */
  taskLabel?: string;
  /** `sm` for map, list and card rows; `default` for page headers. */
  size?: 'sm' | 'default';
  className?: string;
}

const INTERRUPTED = 'The response was interrupted. Press the button again to recover the saved result.';

/** The fields a press sends: stop the running timer (with its version), or start one on the mission. */
export function timerCommandForm(running: RunningTimer | null, taskId: string): FormData {
  const form = new FormData();
  if (running) {
    form.set('timerId', running.id);
    form.set('expectedVersion', String(running.executionVersion));
  } else {
    form.set('taskId', taskId);
  }
  return form;
}

/**
 * Play/stop pill for one mission's timer. Starting and stopping use the same
 * timer commands as the mission page; stopping writes an ordinary task log.
 * The database allows one running timer per user, so the button reads that
 * timer from `RunningTimerProvider`: Stop (with a live clock) on the running
 * mission, and unavailable everywhere else until it is stopped. The pill stays
 * focusable when unavailable so its reason can be read and tapped.
 */
export function TimerButton({ taskId, taskLabel, size = 'sm', className }: TimerButtonProps) {
  const router = useRouter();
  const running = useRunningTimer();
  const [saving, setSaving] = React.useState(false);
  // Busy until the refreshed layout lands, so the button never shows a stale state.
  const [refreshing, startRefresh] = React.useTransition();
  const busy = saving || refreshing;
  const mine = running?.taskId === taskId;
  const elsewhere = running !== null && !mine;
  const subject = taskLabel ? ` on ${taskLabel}` : '';
  const reason = elsewhere ? `Your timer is running on ${running.taskTag}. Stop it there first.` : undefined;

  async function press() {
    if (busy) return;
    if (elsewhere) {
      toast.info(`Your timer is running on ${running.taskTag}`, { description: 'Stop it before starting another one.' });
      return;
    }
    const form = timerCommandForm(mine ? running : null, taskId);
    setSaving(true);
    try {
      const settle = await prepareOperation(form, mine ? 'timerButtonStop' : 'timerButtonStart');
      const result = mine ? await stopTaskTimer(form) : await startTaskTimer(form);
      if (!result.success) {
        toast.error(mine ? 'The timer was not stopped' : 'The timer did not start', { description: result.error });
        return;
      }
      settle();
      if (mine) toast.success(`Timer stopped on ${running.taskTag}`, { description: `${formatElapsed(computeElapsedSeconds(new Date(running.startedAt), new Date()))} saved as a time log.` });
      else toast.success(`Timer started on ${result.data!.taskTag}`, { description: 'Stop it here or from the running-timer pill.' });
      startRefresh(() => router.refresh());
    } catch {
      toast.error('The timer may not have changed', { description: INTERRUPTED });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Button
      type="button"
      size={size}
      shape="pill"
      variant={mine ? 'secondary' : 'accent'}
      onClick={press}
      aria-busy={busy || undefined}
      aria-disabled={elsewhere || busy || undefined}
      aria-label={mine ? `Stop timer${subject}` : `Start timer${subject}`}
      title={reason}
      data-state={mine ? 'running' : elsewhere ? 'blocked' : 'idle'}
      className={cn(
        'font-semibold tabular-nums',
        mine && 'bg-success-subtle text-success-strong hover:bg-success-subtle/70',
        (elsewhere || busy) && 'cursor-not-allowed opacity-60 motion-safe:active:scale-100',
        className,
      )}
    >
      {mine ? <SquareIcon className="fill-current" aria-hidden="true" /> : <PlayIcon className="fill-current" aria-hidden="true" />}
      {/* The visible text is decorative next to the label; the clock would otherwise be announced every second. */}
      <span aria-hidden="true">{mine ? <>Stop <RunningClock startedAt={running.startedAt} /></> : busy ? 'Starting…' : 'Start timer'}</span>
    </Button>
  );
}
