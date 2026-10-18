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
  ownedChecklistId: string | null;
  isSubMission: boolean;
  priority: number;
  childCount: number;
  progressPercentage: number | null;
  applicable: boolean;
}
export interface ChecklistAncestor {
  nodeId: string;
  checklistId: string;
  title: string;
  ownedChecklistId: string | null;
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
