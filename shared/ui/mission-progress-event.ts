'use client';

/**
 * A browser event saying "work was just recorded on this mission" (a row
 * ticked Yes, progress typed, a timer started, time logged). Modules that save
 * work announce it; the tasks module listens and offers to start a mission that
 * is still Not Started. Neither side imports the other.
 */
const EVENT = 'taskpulse:mission-progress';

export interface MissionProgressDetail {
  readonly taskId: string;
}

export function announceMissionProgress(taskId: string): void {
  if (typeof window === 'undefined' || !taskId) return;
  window.dispatchEvent(new CustomEvent<MissionProgressDetail>(EVENT, { detail: { taskId } }));
}

export function onMissionProgress(listener: (detail: MissionProgressDetail) => void): () => void {
  const handle = (event: Event) => {
    const detail = (event as CustomEvent<MissionProgressDetail>).detail;
    if (detail?.taskId) listener(detail);
  };
  window.addEventListener(EVENT, handle);
  return () => window.removeEventListener(EVENT, handle);
}
