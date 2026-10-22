// PUBLIC client-safe exports of the policies module: types, the template
// catalogue, periods, the evaluator and labels. Pure: no server imports.

export type {
  Audience,
  ContributionCounts,
  DayFact,
  FactsModel,
  MemberEvaluation,
  MemberFacts,
  MemberRole,
  Outcome,
  Parameters,
  ParameterValue,
  Period,
  PeriodEvaluation,
  PeriodKind,
  PolicyDefinition,
  Reason,
  Reward,
  TaskCounts,
  TemplateResult,
} from '@/modules/policies/internal/types';
export { TEMPLATES, templateFor, type ParameterSpec, type PolicyTemplate } from '@/modules/policies/internal/templates';
export {
  addDays,
  datesIn,
  isOpen,
  PERIOD_LABELS,
  periodLabel,
  periodOf,
  previousPeriod,
  shortDate,
} from '@/modules/policies/internal/periods';
export { countOutcomes, effectiveParameters, evaluatePolicy, inAudience, type OutcomeCounts } from '@/modules/policies/internal/evaluate';
export { describeReason, OUTCOME_LABELS, outcomeLabel, REASON_LABELS } from '@/modules/policies/internal/labels';
