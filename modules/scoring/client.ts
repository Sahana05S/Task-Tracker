// PUBLIC client-safe API of the scoring module: the ten-factor performance
// engine, award rules, analytics and dashboard/headline builders, and types.
// No server imports, so 'use client' components may use it.

export {
  calculatePerformance,
  COEFFICIENTS,
  FACTOR_LABELS,
  FACTOR_UNITS,
  FACTORS,
  measuredRaw,
  memberEligibilityReasons,
  PERFORMANCE_RULE_VERSION,
  unavailableRaw,
  type CalculationContext,
  type CalculationResult,
  type Factor,
  type FactorCohort,
  type FactorResult,
  type MemberCalculation,
  type MemberRawInputs,
  type Provenance,
  type RawFactor,
} from '@/modules/scoring/internal/performance/engine';
export {
  APPROVED_PERFORMANCE_POLICY,
  archiveAffectsCarriedWindow,
  parsePerformanceSources,
  resolvePerformance,
  taskProductivity,
  type PerformancePolicy,
  type PerformanceSources,
  type SourceMember,
  type SourceTask,
} from '@/modules/scoring/internal/performance/sources';
export { performanceReport } from '@/modules/scoring/internal/performance/report';
export {
  APPROVED_AWARD_POLICY,
  AWARD_RULE_VERSION,
  awardContext,
  selectDaily,
  selectMonthly,
  type AwardCandidate,
  type AwardGate,
  type AwardPolicy,
  type DailySelection,
  type EffectiveAwardDay,
  type MonthlySelection,
} from '@/modules/scoring/internal/stars/contract';
export { performanceForAward } from '@/modules/scoring/internal/stars/scoring';
export {
  attendanceIsValidForDailyStar,
  DAILY_STAR_WEIGHTS,
  LEGACY_DAILY_STAR_RULE_VERSION,
  scoreDailyStarCandidate,
  selectDailyStarWinner,
  type DailyStarCandidateInput,
  type DailyStarCandidateScore,
} from '@/modules/scoring/internal/stars/legacy-scoring';
export type { AwardDay, AwardHistory, AwardReadModel } from '@/modules/scoring/internal/stars/read-model';
export {
  awardDayKind,
  awardDayLabel,
  mondayIndex,
  type AwardDayFacts,
  type AwardDayKind,
} from '@/modules/scoring/internal/stars/display';
export type { AwardCommandResponse } from '@/modules/scoring/internal/stars/daily';
export {
  computeTeamAnalytics,
  isTaskCarriedInPeriod,
  isTaskEligible,
  median,
  type AnalyticsInput,
  type MemberPerformance,
  type TeamAnalytics,
  type TeamMedians,
  type TeamTotals,
} from '@/modules/scoring/internal/analytics/engine';
export { UnmeasuredProgressError } from '@/modules/scoring/internal/analytics/availability';
export {
  buildWorkbookDashboardCharts,
  type DashboardBucket,
  type DashboardMemberMetric,
  type DateBucket,
  type DeadlineOutcomeBucket,
  type PerformanceWithMedianMetric,
  type WorkbookDashboardCharts,
  type WorkbookDashboardInput,
} from '@/modules/scoring/internal/analytics/dashboard-charts';
export {
  computeMissionHeadline,
  leaderBy,
  productivityBand,
  progressBand,
  spreadBand,
  type Band,
  type HeadlineLeader,
  type MissionHeadline,
} from '@/modules/scoring/internal/analytics/headline';
