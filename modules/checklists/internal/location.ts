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

export function openChecklistRow(row: ChecklistBranchRow): ChecklistBranchOptions {
  return row.ownedChecklistId
    ? { checklistId: row.ownedChecklistId, section: 'activity' }
    : { checklistId: row.checklistId, parentNodeId: row.id, section: row.section ?? 'activity' };
}
