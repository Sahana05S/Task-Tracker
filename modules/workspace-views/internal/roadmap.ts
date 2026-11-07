import type { ChecklistBranchOptions } from '@/modules/checklists/client';

export interface RoadmapLocation extends ChecklistBranchOptions {
  missionId: string;
  nodeId?: string;
}
/** Whose missions the map shows: the viewer's own, or (managing director and project engineers) the whole team's. */
export type RoadmapScope = 'mine' | 'team';
export function roadmapSearch(location: RoadmapLocation | null, due: string, view: string, scope: RoadmapScope = 'mine', business: string | null = null): string {
  const query = new URLSearchParams();
  // The business chips (migration 134) as the page read them; absent means the member's own businesses.
  if (business) query.set('business', business);
  if (due !== 'all') query.set('due', due);
  if (view === 'list') query.set('view', 'list');
  if (scope === 'team') query.set('scope', 'team');
  if (location) {
    query.set('mission', location.missionId);
    if (location.checklistId) query.set('checklist', location.checklistId);
    if (location.parentNodeId) query.set('parent', location.parentNodeId);
    if (location.nodeId) query.set('item', location.nodeId);
    if (location.cursor) query.set('cursor', String(location.cursor));
    if (location.section && location.section !== 'activity') query.set('section', location.section);
  }
  return query.size ? `?${query}` : '/today';
}
/** The branch of rows under a row, in the row's own section. */
export function branchForRow(row: { id: string; checklistId: string; section?: ChecklistBranchOptions['section'] | null }): ChecklistBranchOptions {
  return { checklistId: row.checklistId, parentNodeId: row.id, section: row.section ?? 'activity' };
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
/** The scope the URL asks for; anything but `team` is the viewer's own missions. */
export function roadmapScope(value: unknown): RoadmapScope {
  return value === 'team' ? 'team' : 'mine';
}
export function roadmapZoom(value: unknown): number {
  if (typeof value !== 'string' || !/^\d{2,3}$/.test(value)) return 100;
  return Math.max(80, Math.min(130, Math.round(Number(value) / 10) * 10));
}
