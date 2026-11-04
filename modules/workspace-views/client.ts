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

export { roadmapSearch, branchForRow, parseRoadmapLocation, roadmapScope, roadmapZoom, type RoadmapLocation, type RoadmapScope } from '@/modules/workspace-views/internal/roadmap';
export {
  graphCamera, graphFootprint, graphRadius, layoutMissionGraph, wheelZoomFactor, GRAPH_HUES, LABEL_WIDTH,
  type GraphCamera, type GraphEdge, type GraphEntity, type GraphKind, type GraphLevel, type GraphLink, type GraphNode,
  type GraphRelation, type GraphRelationship, type GraphStroke, type MissionGraphLayout,
} from '@/modules/workspace-views/internal/mission-graph';
