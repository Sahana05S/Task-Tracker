import type { ChecklistBranchOptions } from '@/modules/checklists/client';

export interface RoadmapLocation extends ChecklistBranchOptions {
  missionId: string;
  nodeId?: string;
}
export function roadmapSearch(location: RoadmapLocation | null, due: string, view: string, zoom = 100): string {
  const query = new URLSearchParams();
  if (due !== 'all') query.set('due', due);
  if (view === 'list') query.set('view', 'list');
  if (location) {
    query.set('mission', location.missionId);
    if (location.checklistId) query.set('checklist', location.checklistId);
    if (location.parentNodeId) query.set('parent', location.parentNodeId);
    if (location.nodeId) query.set('item', location.nodeId);
    if (location.cursor) query.set('cursor', String(location.cursor));
    if (location.section && location.section !== 'activity') query.set('section', location.section);
  }
  if (zoom !== 100) query.set('zoom', String(zoom));
  return query.size ? `?${query}` : '/today';
}
export function branchForRow(row: { id: string; checklistId: string; ownedChecklistId: string | null }): ChecklistBranchOptions {
  return row.ownedChecklistId ? { checklistId: row.ownedChecklistId, section: 'activity' }
    : { checklistId: row.checklistId, parentNodeId: row.id };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseRoadmapLocation(query: Record<string, string | string[] | undefined>): RoadmapLocation | null {
  if (typeof query.mission !== 'string' || !UUID.test(query.mission)) return null;
  for (const key of ['checklist', 'parent', 'item']) {
    if (query[key] !== undefined && (typeof query[key] !== 'string' || !UUID.test(query[key]))) return null;
  }
  return { missionId: query.mission, checklistId: query.checklist as string | undefined,
    parentNodeId: query.parent as string | undefined, nodeId: query.item as string | undefined,
    cursor: typeof query.cursor === 'string' && /^\d{1,6}$/.test(query.cursor) ? Math.min(100000, Number(query.cursor)) : 0,
    section: query.section === 'setup' || query.section === 'closure' ? query.section : 'activity' };
}
export function roadmapZoom(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{2,3}$/.test(value)) return 100;
  return Math.max(80, Math.min(130, Math.round(Number(value) / 10) * 10));
}
