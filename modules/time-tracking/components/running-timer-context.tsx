'use client';

import * as React from 'react';

import type { RunningTimer } from '@/modules/time-tracking/internal/timers/running-timers';

const NONE: readonly RunningTimer[] = [];
const RunningTimerContext = React.createContext<readonly RunningTimer[]>(NONE);

/**
 * The signed-in user's running timers, read once by the workspace layout
 * (`getRunningTimers`) and shared with every timer button below it. Several
 * missions' timers may run at once (migration 118), at most one per mission.
 * A start or stop refreshes the route, which re-reads the layout and updates
 * this value; there is no second copy of timer state on the client.
 */
export function RunningTimerProvider({ timers, children }: {
  timers: readonly RunningTimer[];
  children: React.ReactNode;
}) {
  // Every route refresh sends a new array; keep the old one unless a timer changed,
  // so buttons on long lists do not re-render for unrelated refreshes.
  const key = timers.map((timer) => `${timer.id}:${timer.executionVersion}`).join(',');
  const value = React.useMemo(() => (timers.length ? timers : NONE), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return <RunningTimerContext.Provider value={value}>{children}</RunningTimerContext.Provider>;
}

/** Every running timer of the user, oldest first (empty outside the provider). */
export function useRunningTimers(): readonly RunningTimer[] {
  return React.useContext(RunningTimerContext);
}

/** The user's running timer on one mission, or null when none runs there. */
export function useRunningTimer(taskId: string): RunningTimer | null {
  const timers = useRunningTimers();
  return timers.find((timer) => timer.taskId === taskId) ?? null;
}
