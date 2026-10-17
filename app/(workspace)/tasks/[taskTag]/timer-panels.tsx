import { Button } from '@/shared/ui/button';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { kolkataDate } from '@/shared/time/kolkata';
import { cn } from '@/shared/utils';
import type { TaskTimer } from '@/types/tracker';

import {
  discardTaskTimer,
  enterManualTaskTime,
  startTaskTimer,
  stopTaskTimer,
} from './timer-actions';

/**
 * Timer, timer records and manual time entry for one mission. These move into
 * the time-tracking module together with ./timer-actions.
 */

/** Shared form-control look for the native forms on this page. */
const FIELD = 'border-input bg-background rounded-xl border px-3 text-sm';

export function TimerControl({
  taskTag,
  activeTimer,
  canUseTimer,
}: {
  taskTag: string;
  activeTimer: TaskTimer | null;
  canUseTimer: boolean;
}) {
  if (!canUseTimer) {
    return (
      <p className="text-muted-foreground text-sm">
        Timers are available only for assigned active missions.
      </p>
    );
  }

  if (activeTimer) {
    return (
      <div className="grid gap-3">
        <div className="bg-success-subtle text-success-strong flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm">
          <span aria-hidden="true" className="bg-success size-2 animate-pulse rounded-full" />
          <span>
            Running since{' '}
            <span className="font-semibold">
              {formatDateTime(activeTimer.startedAt)}
            </span>
          </span>
        </div>
        <ExecutionForm action={stopTaskTimer} scope="stopTaskTimer" className="grid gap-2"><input type="hidden" name="expectedVersion" value={activeTimer.executionVersion ?? 0} />
          <input type="hidden" name="timerId" value={activeTimer.id} />
          <label className="grid gap-1 text-sm">
            <span className="text-foreground font-medium">Stop note</span>
            <textarea
              name="notes"
              className={cn(FIELD, 'min-h-20 py-2')}
              placeholder="What did this timer session cover?"
            />
          </label>
          <Button type="submit" className="rounded-xl">
            Stop and log
          </Button>
        </ExecutionForm>
        <ExecutionForm action={discardTaskTimer} scope="discardTaskTimer" className="grid gap-2"><label className="grid gap-1 text-sm"><span className="text-foreground font-medium">Reason</span><input name="reason" required maxLength={1000} className={cn(FIELD, 'h-9')} /></label><input type="hidden" name="expectedVersion" value={activeTimer.executionVersion ?? 0} />
          <input type="hidden" name="timerId" value={activeTimer.id} />
          <input type="hidden" name="taskTag" value={taskTag} />
          <Button type="submit" variant="ghost" size="sm" className="justify-self-start">
            Discard timer
          </Button>
        </ExecutionForm>
      </div>
    );
  }

  return (
    <ExecutionForm action={startTaskTimer} scope="startTaskTimer" className="grid gap-2">
      <input type="hidden" name="taskTag" value={taskTag} />
      <label className="grid gap-1 text-sm">
        <span className="text-foreground font-medium">Start note</span>
        <textarea
          name="notes"
          className={cn(FIELD, 'min-h-20 py-2')}
          placeholder="Optional timer note"
        />
      </label>
      <Button type="submit" className="rounded-xl">
        Start timer
      </Button>
    </ExecutionForm>
  );
}

export function TimerRecords({
  timers,
  memberNames,
  taskTag,
  canManage,
  currentUserId,
}: {
  timers: readonly TaskTimer[];
  memberNames: ReadonlyMap<string, string>;
  taskTag: string;
  canManage: boolean;
  currentUserId: string;
}) {
  if (timers.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No timer sessions have been recorded for this mission.
      </p>
    );
  }

  return (
    <div className="grid gap-2">
      {timers.map((timer) => {
        const canManageThisTimer = canManage || timer.userId === currentUserId;

        return (
          <div
            key={timer.id}
            className="bg-muted/70 rounded-xl px-3.5 py-2.5 text-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-foreground font-medium">
                  {memberNames.get(timer.userId) ?? 'Unknown'} · {timer.status}
                </p>
                <p className="text-muted-foreground text-xs">
                  {formatDateTime(timer.startedAt)}
                  {timer.stoppedAt ? ` → ${formatDateTime(timer.stoppedAt)}` : ''}
                </p>
                <p className="text-muted-foreground text-xs tabular-nums">
                  {formatElapsed(timer.elapsedSeconds)}
                  {timer.generatedLogId ? ' · logged' : ''}
                </p>
              </div>
              {timer.status === 'Running' && canManageThisTimer ? (
                <ExecutionForm action={stopTaskTimer} scope="stopTaskTimer"><input type="hidden" name="expectedVersion" value={timer.executionVersion ?? 0} />
                  <input type="hidden" name="timerId" value={timer.id} />
                  <Button type="submit" variant="outline" size="sm">
                    Stop
                  </Button>
                </ExecutionForm>
              ) : null}
            </div>
            {timer.notes ? (
              <p className="text-foreground mt-2 text-xs">{timer.notes}</p>
            ) : null}
            {timer.status === 'Running' && canManageThisTimer ? (
              <ExecutionForm action={discardTaskTimer} scope="discardTaskTimer" className="mt-2 grid gap-2"><label className="grid gap-1 text-sm"><span className="font-medium">Reason</span><input name="reason" required maxLength={1000} className={cn(FIELD, 'h-9')} /></label><input type="hidden" name="expectedVersion" value={timer.executionVersion ?? 0} />
                <input type="hidden" name="timerId" value={timer.id} />
                <input type="hidden" name="taskTag" value={taskTag} />
                <Button type="submit" variant="ghost" size="sm" className="justify-self-start">
                  Discard
                </Button>
              </ExecutionForm>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function ManualTimeForm({
  taskTag,
  canUseTimer,
}: {
  taskTag: string;
  canUseTimer: boolean;
}) {
  if (!canUseTimer) {
    return (
      <p className="text-muted-foreground text-sm">
        Manual entries are available only for assigned active missions.
      </p>
    );
  }

  return (
    <ExecutionForm action={enterManualTaskTime} scope="enterManualTaskTime" className="grid gap-2">
      <input type="hidden" name="taskTag" value={taskTag} />
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 grid gap-1 text-sm">
          <span className="text-foreground font-medium">Date</span>
          <input
            type="date"
            name="logDate"
            defaultValue={kolkataDate()}
            className={cn(FIELD, 'h-10')}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-foreground font-medium">Hours</span>
          <input
            type="number"
            name="hoursWorked"
            min={0}
            max={24}
            step="0.25"
            className={cn(FIELD, 'h-10 tabular-nums')}
            required
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-foreground font-medium">Progress added</span>
          <input
            type="number"
            name="progressDelta"
            min={-100}
            max={100}
            step="0.5"
            className={cn(FIELD, 'h-10 tabular-nums')}
            placeholder="0"
          />
        </label>
      </div>
      <label className="grid gap-1 text-sm">
        <span className="text-foreground font-medium">Notes</span>
        <textarea
          name="notes"
          className={cn(FIELD, 'min-h-20 py-2')}
          placeholder="What work was done?"
        />
      </label>
      <Button type="submit" variant="outline" className="rounded-xl">
        Save manual time
      </Button>
    </ExecutionForm>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatElapsed(seconds: number): string {
  if (seconds <= 0) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}
