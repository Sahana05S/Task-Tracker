import type { ChecklistNode } from '@/types/tracker';

/**
 * Pure helpers for nested checklist pages (/tasks/[tag]/checklist/[nodeId]).
 * A node is a container when it is a Page or Group or already has children;
 * containers roll up their direct children in lib/checklists/progress.
 */

export const checklistHref = (taskTag: string, nodeId?: string) =>
  `/tasks/${encodeURIComponent(taskTag)}/checklist${nodeId ? `/${nodeId}` : ''}`;

export function formatMinutes(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

export const isContainer = (n: ChecklistNode, nodes: readonly ChecklistNode[]) =>
  ['Page', 'Group'].includes(n.nodeType) || nodes.some(c => c.parentNodeId === n.id);

export const childrenOf = (id: string | null, nodes: readonly ChecklistNode[]) =>
  nodes.filter(n => n.parentNodeId === id);

/** Root-to-node chain, guarded against cycles. */
export function ancestry(id: string, nodes: readonly ChecklistNode[]): ChecklistNode[] {
  const chain: ChecklistNode[] = [];
  const seen = new Set<string>();
  let current = nodes.find(n => n.id === id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentNodeId ? nodes.find(n => n.id === current!.parentNodeId) : undefined;
  }
  return chain;
}

/** Logged seconds for a node and everything inside it (a page shows its whole subtree). */
export function subtreeSeconds(id: string, nodes: readonly ChecklistNode[], secondsByNode: ReadonlyMap<string, number>): number {
  const seen = new Set<string>();
  const walk = (current: string): number => {
    if (seen.has(current)) return 0;
    seen.add(current);
    return (secondsByNode.get(current) ?? 0) + nodes.filter(n => n.parentNodeId === current).reduce((sum, n) => sum + walk(n.id), 0);
  };
  return walk(id);
}
