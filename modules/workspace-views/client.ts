// PUBLIC client-safe API of workspace-views: the timeline builder and the
// shapes the Today and shell components render.

export {
  buildTaskTimeline,
  type TaskTimeline,
  type TimelineAssigneeGroup,
  type TimelineTaskBar,
  type TimelineTick,
} from '@/modules/workspace-views/internal/timelines/gantt';
export type { NavCounts } from '@/modules/workspace-views/internal/nav-counts';
export type {
  AwardSnapshot,
  FocusMission,
  Section,
  TodayData,
  ValidatedContribution,
  WeekSummary,
} from '@/modules/workspace-views/internal/today';
