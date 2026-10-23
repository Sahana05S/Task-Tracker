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
  /** Set on a Quest row: the Quest's own checklist (migration 67). */
  ownedChecklistId?: string | null;
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
  section: ChecklistSection;
  parentNodeId: string | null;
  hasMore: boolean;
  nextCursor: number | null;
  rollup: ChecklistRollup;
  rootRollup: ChecklistRollup;
}
