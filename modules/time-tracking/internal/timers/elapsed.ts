export function computeElapsedSeconds(startedAt: Date, stoppedAt: Date): number {
  const elapsedMilliseconds = stoppedAt.getTime() - startedAt.getTime();

  if (elapsedMilliseconds <= 0) {
    return 0;
  }

  return Math.floor(elapsedMilliseconds / 1000);
}

export function secondsToRoundedHours(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.round((seconds / 3600) * 100) / 100;
}

export function computeTimerStopSummary(
  startedAt: Date,
  stoppedAt: Date,
): {
  readonly elapsedSeconds: number;
  readonly hoursWorked: number;
} {
  const elapsedSeconds = computeElapsedSeconds(startedAt, stoppedAt);

  return {
    elapsedSeconds,
    hoursWorked: secondsToRoundedHours(elapsedSeconds),
  };
}
