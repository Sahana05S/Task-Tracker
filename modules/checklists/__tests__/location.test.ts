import { describe, expect, it } from 'vitest';
import { checklistWorkHref, openChecklistRow, parseChecklistLocation } from '../internal/location';
import type { ChecklistBranchRow } from '../client';

const checklist = '00000000-0000-4000-8000-000000000001';
const parent = '00000000-0000-4000-8000-000000000002';
const item = '00000000-0000-4000-8000-000000000003';
describe('checklist workspace addresses', () => {
  it('restores checklist, page, section, batch and selected item', () => {
    const url = new URL(checklistWorkHref('TEST/1', { checklistId: checklist, parentNodeId: parent, section: 'closure', cursor: 30 }, item), 'https://example.test');
    expect(url.pathname).toContain('TEST%2F1');
    expect(parseChecklistLocation(Object.fromEntries(url.searchParams))).toEqual({ checklistId: checklist, parentNodeId: parent, section: 'closure', cursor: 30, limit: 30, item });
  });
  it('rejects malformed query values before requesting a branch', () => {
    expect(parseChecklistLocation({ checklist: ['bad'], parent: 'bad', item: 'bad', section: 'bad', cursor: '-1' })).toEqual({ checklistId: undefined, parentNodeId: undefined, section: 'activity', cursor: 0, limit: 30, item: undefined });
  });
  it('opens owned Sub-mission checklists and ordinary pages differently', () => {
    const page = { id: parent, checklistId: checklist, section: 'closure', ownedChecklistId: null } as ChecklistBranchRow;
    expect(openChecklistRow(page)).toEqual({ checklistId: checklist, parentNodeId: parent, section: 'closure' });
    expect(openChecklistRow({ ...page, ownedChecklistId: item })).toEqual({ checklistId: item, section: 'activity' });
  });
});
