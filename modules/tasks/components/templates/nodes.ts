import type { TemplateNode } from '@/modules/tasks/internal/details-contract';

/**
 * Checklist rows in the template editor (Tools page). Pure, so the editor and
 * its tests share one set of rules.
 *
 * A row's parent is always an earlier row in the same section (the rule the
 * editor has always offered), so the rows nested under a row come after it and
 * the saved list keeps every parent before its children.
 */

export type TemplateSection = TemplateNode['section'];

export const TEMPLATE_SECTIONS: readonly { key: TemplateSection; label: string }[] = [
  { key: 'setup', label: 'Setup' },
  { key: 'activity', label: 'Activity' },
  { key: 'closure', label: 'Closure' },
];

/** An editor row; `parent_key` is '' at the top of its section. */
export type EditorNode = Omit<TemplateNode, 'parent_key'> & { parent_key: string };

export function toEditorNodes(nodes: readonly TemplateNode[] | undefined): EditorNode[] {
  return (nodes ?? []).map((node) => ({ ...node, parent_key: node.parent_key ?? '' }));
}

/** The saved shape: section by section, rows in their order, '' parents as null. */
export function toPayloadNodes(nodes: readonly EditorNode[]): TemplateNode[] {
  return TEMPLATE_SECTIONS.flatMap(({ key }) =>
    nodes.filter((node) => node.section === key).map((node) => ({ ...node, parent_key: node.parent_key || null })),
  );
}

/** A key no loaded or added item already uses (a count could repeat one after a loaded template). */
export function nextNodeKey(nodes: readonly { key: string }[]): string {
  const used = new Set(nodes.map((node) => node.key));
  let i = nodes.length + 1;
  while (used.has('node' + i)) i++;
  return 'node' + i;
}

export function addNode(nodes: readonly EditorNode[], section: TemplateSection): EditorNode[] {
  return [...nodes, { key: nextNodeKey(nodes), title: '', section, node_type: 'Item', parent_key: '' }];
}

export function updateNode(
  nodes: readonly EditorNode[],
  key: string,
  patch: Partial<Pick<EditorNode, 'title' | 'parent_key'>>,
): EditorNode[] {
  return nodes.map((node) => (node.key === key ? { ...node, ...patch } : node));
}

/** Keys of every row nested under `key`, at any depth. */
export function descendantKeys(nodes: readonly EditorNode[], key: string): Set<string> {
  const found = new Set<string>();
  let frontier = [key];
  while (frontier.length > 0) {
    const parents = new Set(frontier);
    frontier = nodes
      .filter((node) => parents.has(node.parent_key) && !found.has(node.key) && node.key !== key)
      .map((node) => node.key);
    frontier.forEach((child) => found.add(child));
  }
  return found;
}

/** Removes the row and everything nested under it. */
export function removeNode(nodes: readonly EditorNode[], key: string): EditorNode[] {
  const gone = descendantKeys(nodes, key).add(key);
  return nodes.filter((node) => !gone.has(node.key));
}

/**
 * Moves the row to another section, at its top level and after the rows
 * already there; the rows nested under it move with it and stay nested.
 */
export function changeSection(nodes: readonly EditorNode[], key: string, section: TemplateSection): EditorNode[] {
  const moving = descendantKeys(nodes, key).add(key);
  const moved = nodes
    .filter((node) => moving.has(node.key))
    .map((node) => (node.key === key ? { ...node, section, parent_key: '' } : { ...node, section }));
  return [...nodes.filter((node) => !moving.has(node.key)), ...moved];
}

/**
 * A section's rows in display order, each after its parent, with its depth.
 * A row whose parent is missing from the section shows at the top level.
 */
export function sectionRows(
  nodes: readonly EditorNode[],
  section: TemplateSection,
): { node: EditorNode; depth: number }[] {
  const inSection = nodes.filter((node) => node.section === section);
  const keys = new Set(inSection.map((node) => node.key));
  const rows: { node: EditorNode; depth: number }[] = [];
  const seen = new Set<string>();
  const visit = (parent: string, depth: number) => {
    for (const node of inSection) {
      const top = !node.parent_key || !keys.has(node.parent_key);
      if (!seen.has(node.key) && (parent === '' ? top : node.parent_key === parent)) {
        seen.add(node.key);
        rows.push({ node, depth });
        visit(node.key, depth + 1);
      }
    }
  };
  visit('', 0);
  // Loaded rows that only point at each other still show, at the top level.
  for (const node of inSection) if (!seen.has(node.key)) rows.push({ node, depth: 0 });
  return rows;
}

/** Rows this one may sit inside: earlier rows of its section. */
export function parentOptions(nodes: readonly EditorNode[], key: string): EditorNode[] {
  const index = nodes.findIndex((node) => node.key === key);
  const section = nodes[index]?.section;
  return nodes.slice(0, Math.max(index, 0)).filter((node) => node.section === section);
}

export function sectionCounts(nodes: readonly { section: TemplateSection }[] | undefined): Record<TemplateSection, number> {
  const counts: Record<TemplateSection, number> = { setup: 0, activity: 0, closure: 0 };
  for (const node of nodes ?? []) counts[node.section] += 1;
  return counts;
}
