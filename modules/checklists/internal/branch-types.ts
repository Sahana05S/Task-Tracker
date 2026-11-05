import type { ChecklistNode } from '@/types/tracker';
import type { ChecklistRollup, ChecklistSection } from './progress';

export interface ChecklistBranchOptions {
  checklistId?: string;
  parentNodeId?: string;
  section?: ChecklistSection;
  cursor?: number;
  limit?: number;
}
export interface ChecklistBranchRow extends ChecklistNode {
  priority: number;
  childCount: number;
  /** Set on a sub-mission row: the linked mission's tag and status (migration 71). */
  linkedTaskTag?: string | null;
  linkedTaskStatus?: string | null;
  /** Set on a Quest row: the Quest's own checklist (migration 67). */
  ownedChecklistId?: string | null;
  /** Set on a Quest row: its owner, one of the mission's Crew (migration 122). */
  assigneeId?: string | null;
  /** Set on a Quest row: whether the viewer may change rows inside it (migration 122). */
  canEditQuest?: boolean | null;
  progressPercentage: number | null;
  applicable: boolean;
}
export interface ChecklistAncestor {
  nodeId: string;
  checklistId: string;
  title: string;
  /** Set when this ancestor is a Quest. */
  ownedChecklistId?: string | null;
}
export interface ChecklistBranch {
  taskId: string;
  taskVersion: number;
  checklist: { id: string; taskId: string; ownerNodeId: string | null; title: string } | null;
  ancestors: ChecklistAncestor[];
  rows: ChecklistBranchRow[];
  /**
   * Whether the viewer may change this list's rows (migration 122): managers, all Crew on the
   * mission's own checklist, and inside a Quest its owner and the owners of the Quests above it.
   */
  canEdit?: boolean;
  section: ChecklistSection;
  parentNodeId: string | null;
  hasMore: boolean;
  nextCursor: number | null;
  rollup: ChecklistRollup;
  rootRollup: ChecklistRollup;
}
