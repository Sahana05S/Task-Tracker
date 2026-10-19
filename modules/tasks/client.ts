// PUBLIC client-safe API of the tasks module: task rules, permissions, filters
// and types. No server imports, so 'use client' components may use it.

export {
  classifyFreshness,
  eligibilityReasons,
  ELIGIBILITY_LABELS,
  FRESHNESS_SCORES,
  PRIORITY_WEIGHTS,
  scaleValue,
  type FreshnessResult,
} from '@/modules/tasks/internal/contract';
export {
  DETAIL_FIELDS,
  detailValues,
  IPO_ROLES,
  ipoLinks,
  isValidDetailEntry,
  sectionsForRole,
  type DetailInstance,
  type DetailKey,
  type IpoRole,
  type NativeTemplate,
  type TemplateNode,
} from '@/modules/tasks/internal/details-contract';
export { canManageTasks, canUpdateTaskOwnFields, isAssignedToTask } from '@/modules/tasks/internal/permissions';
export { EMPTY_EFFORT, type TaskEffort } from '@/modules/tasks/internal/effort';
export { equalParticipantShares, parseSharePercent, TOTAL_SHARE_UNITS } from '@/modules/tasks/internal/shares';
export { mapTask, mapTasks, TASK_COLUMNS, withTaskParticipants } from '@/modules/tasks/internal/mappers';
export { canUseWorkbookWorkflow, WORKBOOK_WORKFLOWS, type WorkbookWorkflow, type WorkbookWorkflowId } from '@/modules/tasks/internal/tools/workflows';
export type { ToolOperation, ToolsPreview } from '@/modules/tasks/internal/tools/contract';
export type { SupportSplitMode } from '@/modules/tasks/internal/tools/support-split';

export { MISSION_BATCH_SIZE, compareRoadmapMissions, missionBatchLimit, missionDueFilter, missionDueLabel, type MissionDueFilter, type MissionBatchOptions, type RoadmapMission, type RoadmapMissionBatch } from '@/modules/tasks/internal/roadmap-contract';
