export function computeElapsedSeconds(startedAt: Date, stoppedAt: Date): number {
  const elapsedMilliseconds = stoppedAt.getTime() - startedAt.getTime();

  if (elapsedMilliseconds <= 0) {
    return 0;
  }

  return Math.floor(elapsedMilliseconds / 1000);
}

/** "1h 5m" or "12m" for a timer's elapsed seconds. */
export function formatElapsed(seconds: number): string {
  if (seconds <= 0) return '0m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
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
