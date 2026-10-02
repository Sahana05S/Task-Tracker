import { computeTimerStopSummary } from '@/lib/timers/elapsed';

export interface TimerLogDraft {
  readonly logDate: string;
  readonly hoursWorked: number;
  readonly elapsedSeconds: number;
  readonly updateNotes: string;
}

export function createTimerLogDraft({
  startedAt,
  stoppedAt,
  notes,
}: {
  readonly startedAt: Date;
  readonly stoppedAt: Date;
  readonly notes: string | null;
}): TimerLogDraft {
  const { elapsedSeconds, hoursWorked } = computeTimerStopSummary(
    startedAt,
    stoppedAt,
  );
  const startedLabel = startedAt.toISOString();
  const stoppedLabel = stoppedAt.toISOString();

  return {
    logDate: stoppedLabel.slice(0, 10),
    hoursWorked,
    elapsedSeconds,
    updateNotes:
      notes && notes.trim() !== ''
        ? notes.trim()
        : `Timer session from ${startedLabel} to ${stoppedLabel}.`,
  };
}
