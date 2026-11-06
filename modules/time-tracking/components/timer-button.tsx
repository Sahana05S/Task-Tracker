'use client';

import * as React from 'react';
import { PlayIcon, SquareIcon } from 'lucide-react';
import { toast } from 'sonner';

import { RunningClock } from '@/shared/ui/running-clock';
import { useMissionHasQuests, useRunningTimer } from '@/modules/time-tracking/components/running-timer-context';
import { runningTimerLabel } from '@/modules/time-tracking/internal/timers/labels';
import { computeElapsedSeconds, formatElapsed } from '@/modules/time-tracking/internal/timers/elapsed';
import type { RunningTimer } from '@/modules/time-tracking/internal/timers/running-timers';
import { startItemTimer, startTaskTimer, stopTaskTimer } from '@/modules/time-tracking/timer-actions';
import { prepareOperation } from '@/shared/commands/client-operation';
import { announceMissionProgress } from '@/shared/ui/mission-progress-event';
import { Button } from '@/shared/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { cn } from '@/shared/utils';

export interface TimerButtonProps {
  /** The mission this button times. */
  taskId: string;
  /** Names the mission in the accessible label, e.g. its tag; needed where several buttons share a page. */
  taskLabel?: string;
  /**
   * The Quest this button times (migration 123). Omitted for the mission timer, which a
   * mission with Quests no longer has: the button then shows only to stop a mission timer
   * started before the Quests were added.
   */
  nodeId?: string | null;
  /** The Quest's title, for labels such as "Start timer on TT-1 › Survey". */
  questTitle?: string;
  /** A shorter visible text (e.g. "Start") where the button sits on a dense row. */
  compact?: boolean;
  /** `sm` for map, list and card rows; `default` for page headers. */
  size?: 'sm' | 'default';
  className?: string;
}

const INTERRUPTED = 'The response was interrupted. Press the button again to recover the saved result.';

/**
 * The fields a press sends: stop the running timer (with its version and the
 * session note from the Stop sheet), or start one on the mission or, with
 * `nodeId`, on one of its Quests.
 */
export function timerCommandForm(running: RunningTimer | null, taskId: string, notes?: string, nodeId?: string | null): FormData {
  const form = new FormData();
  if (running) {
    form.set('timerId', running.id);
    form.set('expectedVersion', String(running.executionVersion));
    if (notes !== undefined) form.set('notes', notes);
  } else if (nodeId) {
    form.set('nodeId', nodeId);
  } else {
    form.set('taskId', taskId);
  }
  return form;
}

/**
 * Play/stop pill for one Quest's timer, or a mission's timer when the mission
 * has no Quests (migration 123). Starting and stopping use the same timer
 * commands as the mission page; stopping writes an ordinary task log (tagged
 * with the Quest). Several timers may run at once (migrations 118, 123), one
 * per person per Quest, so the button reads its own timer from
 * `RunningTimerProvider`: Stop (with a live clock) where it runs, Start
 * everywhere else. Stop opens a
 * sheet with the session note (`task_timers.notes`, decision D-C2), so the
 * person can say what the session covered before it is logged.
 */
export function TimerButton({ taskId, taskLabel, nodeId = null, questTitle, compact = false, size = 'sm', className }: TimerButtonProps) {
  const running = useRunningTimer(taskId, nodeId);
  const questsOnly = useMissionHasQuests(taskId) && !nodeId;
  const [saving, setSaving] = React.useState(false);
  const [stopping, setStopping] = React.useState(false);
  const [note, setNote] = React.useState('');
  const noteId = React.useId();
  // Busy until the command (and the refreshed page it carries) lands, so the button never shows a stale state.
  const busy = saving;
  const mine = running !== null;
  const named = [taskLabel, questTitle].filter(Boolean).join(' › ');
  const subject = named ? ` on ${named}` : '';

  function press() {
    if (busy) return;
    if (mine) {
      setNote(running.notes ?? '');
      setStopping(true);
      return;
    }
    void send();
  }

  async function send(notes?: string) {
    const form = timerCommandForm(mine ? running : null, taskId, notes, nodeId);
    setSaving(true);
    try {
      const settle = await prepareOperation(form, mine ? 'timerButtonStop' : 'timerButtonStart');
      const result = mine ? await stopTaskTimer(form) : nodeId ? await startItemTimer(form) : await startTaskTimer(form);
      if (!result.success) {
        toast.error(mine ? 'The timer was not stopped' : 'The timer did not start', { description: result.error });
        return;
      }
      settle();
      setStopping(false);
      if (mine) toast.success(`Timer stopped on ${runningTimerLabel(running)}`, { description: `${formatElapsed(computeElapsedSeconds(new Date(running.startedAt), new Date()))} saved as a time log.` });
      else {
        toast.success(`Timer started on ${[result.data!.taskTag, questTitle].filter(Boolean).join(' › ')}`, { description: 'Stop it here or from the running-timer pill.' });
        announceMissionProgress(taskId);
      }
      // No extra page refresh: timer commands revalidate, so the response already carries the refreshed page.
    } catch {
      toast.error('The timer may not have changed', { description: INTERRUPTED });
    } finally {
      setSaving(false);
    }
  }

  // A mission with Quests is timed on its Quests; only a mission timer still running shows here.
  if (questsOnly && !mine) return null;

  return (
    <>
    <Button
      type="button"
      size={size}
      shape="pill"
      variant={mine ? 'secondary' : 'accent'}
      onClick={press}
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      aria-label={mine ? `Stop timer${subject}` : `Start timer${subject}`}
      data-state={mine ? 'running' : 'idle'}
      className={cn(
        'font-semibold tabular-nums',
        mine && 'bg-success-subtle text-success-strong hover:bg-success-subtle/70',
        busy && 'cursor-not-allowed opacity-60 motion-safe:active:scale-100',
        className,
      )}
    >
      {mine ? <SquareIcon className="fill-current" aria-hidden="true" /> : <PlayIcon className="fill-current" aria-hidden="true" />}
      {/* The visible text is decorative next to the label; the clock would otherwise be announced every second. */}
      <span aria-hidden="true">{mine ? <>Stop <RunningClock startedAt={running.startedAt} /></> : busy ? 'Starting…' : compact ? 'Start' : 'Start timer'}</span>
    </Button>
    {mine ? (
      <Sheet open={stopping} onOpenChange={(open) => { if (!saving) setStopping(open); }}>
        <SheetContent side="bottom" className="mx-auto w-full gap-0 sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="text-foreground text-lg font-bold">Stop timer on {runningTimerLabel(running)}</SheetTitle>
            <SheetDescription className="text-muted-foreground">
              <RunningClock startedAt={running.startedAt} /> so far. Stopping saves it as a time log on this {running.nodeId ? 'Quest' : 'mission'}.
            </SheetDescription>
          </SheetHeader>
          <form
            className="grid gap-3 px-4 pb-2"
            onSubmit={(event) => { event.preventDefault(); void send(note); }}
          >
            <label htmlFor={noteId} className="text-foreground text-sm font-medium">What did this session cover?</label>
            <textarea
              id={noteId}
              name="notes"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={10000}
              className="field min-h-24 py-2"
              placeholder="Optional. Kept with the time log."
            />
            <SheetFooter className="flex-row flex-wrap gap-2 px-0">
              <Button type="submit" disabled={saving} aria-busy={saving || undefined}>{saving ? 'Stopping…' : 'Stop and log'}</Button>
              <Button type="button" variant="ghost" disabled={saving} onClick={() => setStopping(false)}>Keep running</Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    ) : null}
    </>
  );
}
