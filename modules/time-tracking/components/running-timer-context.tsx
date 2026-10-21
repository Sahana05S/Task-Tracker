'use client';

import * as React from 'react';

import type { RunningTimer } from '@/modules/time-tracking/internal/timers/running-timers';

const RunningTimerContext = React.createContext<RunningTimer | null>(null);

/**
 * The signed-in user's running timer, read once by the workspace layout
 * (`getRunningTimers`) and shared with every timer button below it. The
 * database allows one running timer per user, so the first row is the one.
 * A start or stop refreshes the route, which re-reads the layout and updates
 * this value; there is no second copy of timer state on the client.
 */
export function RunningTimerProvider({ timers, children }: {
  timers: readonly RunningTimer[];
  children: React.ReactNode;
}) {
  const first = timers[0] ?? null;
  // Every route refresh sends a new object; keep the old one unless the timer changed,
  // so buttons on long lists do not re-render for unrelated refreshes.
  const timer = React.useMemo(() => first, [first?.id, first?.executionVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  return <RunningTimerContext.Provider value={timer}>{children}</RunningTimerContext.Provider>;
}

/** The user's running timer, or null when none is running (or outside the provider). */
export function useRunningTimer(): RunningTimer | null {
  return React.useContext(RunningTimerContext);
}
