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
  SALES_MAPPING_MISSING,
  type Board,
  type BoardKey,
  type BoardRow,
  type BoardStatus,
  type LeaderboardModel,
} from '@/modules/recognition/internal/leaderboard-rules';
