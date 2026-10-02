export interface ChecklistProgressNode {
  readonly id: string;
  readonly parentNodeId: string | null;
  readonly isComplete: boolean;
  readonly progressPercentage?: number | null;
}

export interface ChecklistNodeProgress {
  readonly id: string;
  readonly progressPercentage: number;
  readonly isComplete: boolean;
}

/**
 * Computes equal-weight checklist progress.
 *
 * Leaf nodes are 0 or 100. Parent nodes are the average of their direct
 * children, and are complete only when every child is complete.
 */
export function computeChecklistProgress(
  nodes: readonly ChecklistProgressNode[],
): {
  readonly overallProgressPercentage: number;
  readonly nodeProgress: readonly ChecklistNodeProgress[];
} {
  if (nodes.length === 0) {
    return {
      overallProgressPercentage: 0,
      nodeProgress: [],
    };
  }

  const childrenByParent = new Map<string | null, ChecklistProgressNode[]>();

  for (const node of nodes) {
    const siblings = childrenByParent.get(node.parentNodeId) ?? [];
    siblings.push(node);
    childrenByParent.set(node.parentNodeId, siblings);
  }

  const progressById = new Map<string, ChecklistNodeProgress>();

  function resolveNode(node: ChecklistProgressNode): ChecklistNodeProgress {
    const cached = progressById.get(node.id);

    if (cached) {
      return cached;
    }

    const children = childrenByParent.get(node.id) ?? [];
    const result =
      children.length === 0
        ? summarizeLeaf(node)
        : summarizeParent(node.id, children);

    progressById.set(node.id, result);
    return result;
  }

  function summarizeLeaf(node: ChecklistProgressNode): ChecklistNodeProgress {
    const progressPercentage =
      node.progressPercentage === null || node.progressPercentage === undefined
        ? node.isComplete
          ? 100
          : 0
        : clampProgress(node.progressPercentage);

    return {
      id: node.id,
      progressPercentage,
      isComplete: node.isComplete || progressPercentage >= 100,
    };
  }

  function summarizeParent(
    nodeId: string,
    children: readonly ChecklistProgressNode[],
  ): ChecklistNodeProgress {
    const childProgress = children.map(resolveNode);
    const progressTotal = childProgress.reduce(
      (total, child) => total + child.progressPercentage,
      0,
    );

    return {
      id: nodeId,
      progressPercentage: progressTotal / childProgress.length,
      isComplete: childProgress.every((child) => child.isComplete),
    };
  }

  const rootNodes = childrenByParent.get(null) ?? [];
  const rootProgress = rootNodes.map(resolveNode);
  const overallProgressPercentage =
    rootProgress.reduce((total, root) => total + root.progressPercentage, 0) /
    rootProgress.length;

  return {
    overallProgressPercentage,
    nodeProgress: [...progressById.values()],
  };
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}
