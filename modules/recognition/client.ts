// PUBLIC client-safe exports of the recognition module: types, constants and
// pure rules only (no server imports), so 'use client' components may use it.

export {
  computeStreak,
  dailyStarHighlight,
  DEFAULT_MILESTONES,
  milestonesReached,
  type DailyStarHighlight,
  type DailyStarSource,
  type DailyStarStatus,
  type DayCode,
  type DayState,
  type StreakDay,
  type StreakSummary,
} from '@/modules/recognition/internal/rules';
export {
  DEFAULT_RECOGNITION_POLICY,
  parseRecognitionPolicy,
  parseWaypoints,
  type RecognitionPolicy,
} from '@/modules/recognition/internal/policy';
export {
  BOARD_KEYS,
  BOARD_LABELS,
  BOARD_SUMMARIES,
  buildLeaderboard,
  parseBoardKey,
  podiumSteps,
  rankExact,
  type Board,
  type BoardKey,
  type BoardRow,
  type BoardStatus,
  type LeaderboardModel,
} from '@/modules/recognition/internal/leaderboard-rules';
export {
  monthlyStarAct,
  projectCategories,
  selectCategoryWinners,
  type CategoryAward,
  type CategoryStatus,
  type CeremonyModel,
  type CeremonyStatus,
  type MonthlyStarAct,
} from '@/modules/recognition/internal/ceremony-rules';
export {
  pointsFor,
  rankHall,
  tierFor,
  TIERS,
  type HallEntry,
  type HallOfFameModel,
  type MemberTrophies,
  type Tier,
  type TierKey,
  type TierProgress,
  type TrophyCounts,
  type TrophyEvent,
} from '@/modules/recognition/internal/hall-rules';
export { DEFAULT_WAYPOINTS, type Waypoint } from '@/modules/recognition/internal/rules';
export {
  CELEBRATION_WINDOW_MS,
  freshCelebrations,
  missionWaypoints,
  waypointState,
  type WaypointCelebrationItem,
  type MissionWaypoints,
  type WaypointCrossing,
  type WaypointState,
} from '@/modules/recognition/internal/waypoint-rules';
