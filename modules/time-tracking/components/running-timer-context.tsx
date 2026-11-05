'use client';

import * as React from 'react';

import type { RunningTimer } from '@/modules/time-tracking/internal/timers/running-timers';

const NONE: readonly RunningTimer[] = [];
const NO_QUESTS: ReadonlySet<string> = new Set();
const RunningTimerContext = React.createContext<readonly RunningTimer[]>(NONE);
const QuestMissionContext = React.createContext<ReadonlySet<string>>(NO_QUESTS);

/**
 * The signed-in user's running timers, read once by the workspace layout
 * (`getRunningTimers`) and shared with every timer button below it. Several
 * timers may run at once (migration 118): at most one per person per Quest,
 * or one mission timer on a mission without Quests (migration 123).
 * `questMissionIds` (`getQuestMissionIds`) names the missions that have
 * Quests, which are timed on their Quests rather than as a whole.
 * A start or stop refreshes the route, which re-reads the layout and updates
 * this value; there is no second copy of timer state on the client.
 */
export function RunningTimerProvider({ timers, questMissionIds, children }: {
  timers: readonly RunningTimer[];
  questMissionIds?: readonly string[];
  children: React.ReactNode;
}) {
  // Every route refresh sends a new array; keep the old one unless a timer changed,
  // so buttons on long lists do not re-render for unrelated refreshes.
  const key = timers.map((timer) => `${timer.id}:${timer.executionVersion}`).join(',');
  const value = React.useMemo(() => (timers.length ? timers : NONE), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const questKey = (questMissionIds ?? []).join(',');
  const quests = React.useMemo(() => (questMissionIds?.length ? new Set(questMissionIds) : NO_QUESTS), [questKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <RunningTimerContext.Provider value={value}>
      <QuestMissionContext.Provider value={quests}>{children}</QuestMissionContext.Provider>
    </RunningTimerContext.Provider>
  );
}

/** Every running timer of the user, oldest first (empty outside the provider). */
export function useRunningTimers(): readonly RunningTimer[] {
  return React.useContext(RunningTimerContext);
}

/**
 * The user's running timer on one mission's Quest (`nodeId`), or on the
 * mission itself when `nodeId` is omitted; null when none runs there.
 */
export function useRunningTimer(taskId: string, nodeId: string | null = null): RunningTimer | null {
  const timers = useRunningTimers();
  return timers.find((timer) => timer.taskId === taskId && (timer.nodeId ?? null) === nodeId) ?? null;
}

/** Whether a mission has Quests, so it is timed on them (migration 123). */
export function useMissionHasQuests(taskId: string): boolean {
  return React.useContext(QuestMissionContext).has(taskId);
}
