import { UUID_PATTERN } from '@/shared/forms/form-data';
import { CHECKLIST_SECTIONS, type ChecklistSection } from './progress';
import type { ChecklistBranchOptions, ChecklistBranchRow } from './branch-types';

export function checklistWorkHref(taskTag: string, options: ChecklistBranchOptions = {}, item?: string) {
  const query = new URLSearchParams();
  if (options.checklistId) query.set('checklist', options.checklistId);
  if (options.parentNodeId) query.set('parent', options.parentNodeId);
  if (options.section) query.set('section', options.section);
  if (options.cursor) query.set('cursor', String(options.cursor));
  if (item) query.set('item', item);
  return `/tasks/${encodeURIComponent(taskTag)}/checklist${query.size ? `?${query}` : ''}`;
}

export function parseChecklistLocation(query: Record<string, string | string[] | undefined>): ChecklistBranchOptions & { item?: string } {
  const uuid = (key: string) => typeof query[key] === 'string' && UUID_PATTERN.test(query[key]) ? query[key] : undefined;
  const section = CHECKLIST_SECTIONS.includes(query.section as ChecklistSection) ? query.section as ChecklistSection : 'activity';
  const cursor = typeof query.cursor === 'string' && /^\d{1,6}$/.test(query.cursor) ? Number(query.cursor) : 0;
  return { checklistId: uuid('checklist'), parentNodeId: uuid('parent'), section, cursor, limit: 30, item: uuid('item') };
}

/** Opens the table of the rows under a row. */
export function openChecklistRow(row: Pick<ChecklistBranchRow, 'id' | 'checklistId' | 'section' | 'ownedChecklistId'>): ChecklistBranchOptions {
  // A Quest opens as a master checklist of its own.
  if (row.ownedChecklistId) return { checklistId: row.ownedChecklistId, section: 'activity' };
  return { checklistId: row.checklistId, parentNodeId: row.id, section: row.section ?? 'activity' };
}

/** Ways to show a checklist: the sheet's table, phase columns, cards, or the whole tree. */
export const CHECKLIST_VIEWS = ['table', 'board', 'blocks', 'outline'] as const;
export type ChecklistView = typeof CHECKLIST_VIEWS[number];

export function parseChecklistView(value: string | string[] | undefined): ChecklistView | null {
  return typeof value === 'string' && (CHECKLIST_VIEWS as readonly string[]).includes(value) ? value as ChecklistView : null;
}

/** Where a row opens: a Quest's checklist, a row's table, or a sub-mission's own page; null for a plain item. */
export function rowHref(taskTag: string, row: Pick<ChecklistBranchRow, 'id' | 'checklistId' | 'section' | 'ownedChecklistId' | 'linkedTaskTag' | 'childCount' | 'linkedTaskId' | 'nodeType'>): string | null {
  if (row.linkedTaskId) return row.linkedTaskTag ? `/tasks/${encodeURIComponent(row.linkedTaskTag)}` : null;
  if (row.ownedChecklistId || row.childCount > 0) return checklistWorkHref(taskTag, openChecklistRow(row));
  return null;
}
