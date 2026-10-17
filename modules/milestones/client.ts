// PUBLIC client-safe exports: types and pure helpers only (no server imports).
export {
  milestoneCompletion,
  openMilestoneCount,
  sortMilestones,
  summariseMilestones,
  type MilestoneSummary,
} from '@/modules/milestones/internal/goals';
export {
  CORE_VALUES_KEY,
  findStatement,
  isShowcaseStatementKey,
  MISSION_KEY,
  parseCoreValues,
  SHOWCASE_STATEMENT_KEYS,
  VISION_KEY,
  type CoreValue,
  type ShowcaseStatementKey,
} from '@/modules/milestones/internal/statements';
