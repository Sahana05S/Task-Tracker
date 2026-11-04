// PUBLIC client-safe API of the checklists module: progress rules, page/tree
// helpers and types. No server imports, so 'use client' components may use it.

export {
  CHECKLIST_SECTIONS,
  computeChecklistProgress,
  PROGRESS_WEIGHTS,
  weightedOverall,
  type ChecklistNodeProgress,
  type ChecklistProgressNode,
  type ChecklistRollup,
  type ChecklistSection,
  type CompletionState,
  type SectionProgress,
} from '@/modules/checklists/internal/progress';
export { ancestry, childrenOf, formatMinutes, isContainer, subtreeSeconds } from '@/modules/checklists/internal/pages';
export { groupItemHours, type ItemHourLog, type ItemHourRow, type ItemHourTask } from '@/modules/checklists/internal/item-hours';
export type { ChecklistItemTime, RunningItemTimer, TaskEffortBreakdown } from '@/modules/checklists/internal/item-time';

export type { ChecklistBranch, ChecklistBranchOptions, ChecklistBranchRow, ChecklistAncestor } from './internal/branch-types';
export { CHECKLIST_VIEWS, checklistWorkHref, parseChecklistLocation, parseChecklistView, openChecklistRow, rowHref, type ChecklistView } from './internal/location';
export {
  SECTION_TITLES,
  checklistGate,
  checklistIssues,
  commandVersion,
  opensTable,
  pageResult,
  percentText,
  rowKind,
  sectionStatus,
  stateChoices,
  type ChecklistRowKind,
} from './internal/table';
export {
  NO_REVIEWS,
  REVIEW_DECISIONS,
  REVIEW_NOTE_MAX,
  REVIEW_STATES,
  blockingReviews,
  canDecideObjective,
  mayReviewObjectives,
  parseObjectiveReviews,
  reviewChip,
  reviewDecisionError,
  reviewStateAfterTick,
  reviewsAwaiting,
  reviewsByNode,
  type ObjectiveReview,
  type ObjectiveReviewDecision,
  type ObjectiveReviews,
  type ObjectiveReviewState,
  type ReviewChip,
} from './internal/review';
