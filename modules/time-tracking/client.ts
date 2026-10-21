// PUBLIC client-safe API of the time-tracking module: effort and productivity
// formulas, log/timer mappers, timer permissions and types. No server imports.

export {
  aggregateEffortByTask,
  applyProgressDelta,
  clampProgress,
  computeProductivity,
  computeScaledProgress,
  groupLogsByDate,
  isMetricsEligible,
  roundToNumericScale,
  sumHours,
  sumProgressDelta,
  type LogDateGroup,
} from '@/modules/time-tracking/internal/logs/metrics';
export { LOG_COLUMNS, mapDailyTaskLog, mapDailyTaskLogs } from '@/modules/time-tracking/internal/logs/mappers';
export { mapTaskTimer, mapTaskTimers, TIMER_COLUMNS } from '@/modules/time-tracking/internal/timers/mappers';
export { canManageTimerRecord, canStartTimerForTask } from '@/modules/time-tracking/internal/timers/permissions';
export { computeElapsedSeconds, computeTimerStopSummary, formatElapsed, secondsToRoundedHours } from '@/modules/time-tracking/internal/timers/elapsed';
export type { RunningTimer } from '@/modules/time-tracking/internal/timers/running-timers';
export type { TeamRunningTimer } from '@/modules/time-tracking/internal/timers/queries';
export type { TaskExecution } from '@/modules/time-tracking/internal/execution';
export type { LogHistoryData } from '@/modules/time-tracking/internal/logs/queries';
