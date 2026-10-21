// PUBLIC server-side API of the recognition module (M16 gamification layer).
// Pages read through here; components render what the page hands them.

export { getStreak } from '@/modules/recognition/internal/streaks';
export { getDailyStarHighlight } from '@/modules/recognition/internal/daily-star';
export { getLeaderboard, leaderboardPeriod } from '@/modules/recognition/internal/leaderboard';
export { getCeremony } from '@/modules/recognition/internal/ceremony';
export {
  getMissionWaypoints,
  getTaskWaypoints,
  getWaypointCount,
  type TaskWaypointsModel,
  type WaypointCount,
} from '@/modules/recognition/internal/waypoints';
export * from '@/modules/recognition/client';
