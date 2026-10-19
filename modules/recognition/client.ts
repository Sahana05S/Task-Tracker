// PUBLIC client-safe exports of the recognition module: types, constants and
// pure rules only (no server imports), so 'use client' components may use it.

export {
  computeStreak,
  DEFAULT_MILESTONES,
  milestonesReached,
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
