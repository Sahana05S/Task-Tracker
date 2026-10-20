// PUBLIC client-safe API of the checklists module: progress rules, page/tree
// helpers and types. No server imports, so 'use client' components may use it.

export {
  CHECKLIST_SECTIONS,
  computeChecklistProgress,
  type ChecklistNodeProgress,
  type ChecklistProgressNode,
  type ChecklistRollup,
  type ChecklistSection,
  type CompletionState,
  type SectionInitialization,
  type SectionProgress,
} from '@/modules/checklists/internal/progress';
export { ancestry, checklistHref, childrenOf, formatMinutes, isContainer, subtreeSeconds } from '@/modules/checklists/internal/pages';
export { groupItemHours, type ItemHourLog, type ItemHourRow, type ItemHourTask } from '@/modules/checklists/internal/item-hours';
export type { ChecklistItemTime, RunningItemTimer, TaskEffortBreakdown } from '@/modules/checklists/internal/item-time';

export type { ChecklistBranch, ChecklistBranchOptions, ChecklistBranchRow, ChecklistAncestor } from './internal/branch-types';
export { checklistWorkHref, parseChecklistLocation, openChecklistRow } from './internal/location';
export {
  ROW_KIND_LABELS,
  SECTION_TITLES,
  checklistIssues,
  commandVersion,
  isSectionRoot,
  opensTable,
  pageResult,
  percentText,
  rowKind,
  sectionStatus,
  stateChoices,
  type ChecklistRowKind,
} from './internal/table';
