import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, replace() {}, push() {} }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement('a', { href, ...rest }, children),
}));

import { checklistIssues, commandVersion, isSectionRoot, pageResult, rowKind, sectionStatus, stateChoices } from '@/modules/checklists/client';
import type { ChecklistBranchRow, ChecklistRollup, SectionProgress } from '@/modules/checklists/client';
import { ChecklistWorkspace, type ChecklistWorkspaceProps } from '@/modules/checklists/components/checklist-workspace';
import type { Task } from '@/types/tracker';

const CHECKLIST = '11111111-1111-4111-8111-111111111111';
const TASK = '22222222-2222-4222-8222-222222222222';

function row(overrides: Partial<ChecklistBranchRow> & { id: string; title: string }): ChecklistBranchRow {
  return {
    checklistId: CHECKLIST, parentNodeId: null, linkedTaskId: null, nodeType: 'Item', description: null, isComplete: false,
    section: 'activity', completionState: 'No', sortOrder: 0, estimatedMinutes: null, links: [], elapsedSeconds: 0,
    completedBy: null, completedAt: null, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
    ownedChecklistId: null, isSubMission: false, priority: 0, childCount: 0, progressPercentage: 0, applicable: true,
    ...overrides,
  };
}

const section = (state: SectionProgress['state'], progressPercentage: number | null, isComplete = false): SectionProgress =>
  ({ state, progressPercentage, isComplete, applicable: state !== 'not_applicable' });

const rollup: ChecklistRollup = {
  contract: 'm05-checklist-v1',
  sections: { setup: section('complete', 100, true), activity: section('partial', 40), closure: section('uninitialized', null) },
  taskProgress: 40,
  overallProgressPercentage: 40,
  isComplete: false,
  errors: ['unsectioned:abc', 'unsectioned:def'],
  nodeProgress: [{ id: 'page-1', progressPercentage: 50, isComplete: false, applicable: true }],
};

const task = { id: TASK, taskTag: 'Sep26_T5', title: 'Basement drawings', status: 'In Progress', archivedEffectiveDate: null, lifecycleVersion: 7, assigneeIds: [] } as unknown as Task;
const noop = async () => ({ success: true as const, data: null });

function props(overrides: Partial<ChecklistWorkspaceProps> = {}): ChecklistWorkspaceProps {
  return {
    task,
    ownerNames: ['Kaviya'],
    checklist: { id: CHECKLIST, ownerNodeId: null, title: 'Master checklist' },
    ancestors: [],
    rollup,
    version: 7,
    sections: [
      { section: 'setup', rows: [row({ id: 'setup-1', title: 'Brief confirmed', section: 'setup', completionState: 'Yes', isComplete: true, progressPercentage: 100 })], addParentId: null, cursor: 0, nextCursor: null, moreHref: null },
      { section: 'activity', rows: [
        row({ id: 'item-1', title: 'Draw section A', estimatedMinutes: 90, links: ['https://example.com/a'], elapsedSeconds: 3600 }),
        row({ id: 'page-1', title: 'Structural review', nodeType: 'Page', childCount: 3, progressPercentage: 50 }),
        row({ id: 'linked-1', title: 'Survey mission', linkedTaskId: '33333333-3333-4333-8333-333333333333' }),
      ], addParentId: 'activity-root', cursor: 0, nextCursor: 50, moreHref: null },
      { section: 'closure', rows: [], addParentId: null, cursor: 0, nextCursor: null, moreHref: null },
    ],
    manager: false,
    executor: true,
    canTime: false,
    selectedItem: undefined,
    actions: { checklist: noop, start: noop, stop: noop, discard: noop },
    ...overrides,
  };
}

describe('checklist table rules', () => {
  it('classifies rows and the choices each offers', () => {
    expect(rowKind(row({ id: 'a', title: 'a' }))).toBe('item');
    expect(rowKind(row({ id: 'a', title: 'a', nodeType: 'Group' }))).toBe('page');
    expect(rowKind(row({ id: 'a', title: 'a', isSubMission: true, nodeType: 'Page' }))).toBe('submission');
    expect(rowKind(row({ id: 'a', title: 'a', linkedTaskId: 'x' }))).toBe('linked');
    expect(rowKind(row({ id: 'a', title: 'a', childCount: 2 }))).toBe('parent-item');
    expect(stateChoices('item')).toEqual(['Yes', 'No', 'N/A']);
    expect(stateChoices('linked')).toEqual(['No', 'N/A']);
    expect(stateChoices('page')).toEqual([]);
    expect(stateChoices('parent-item')).toEqual([]);
  });

  it('recognises a template section root only at the top of its own section', () => {
    expect(isSectionRoot(row({ id: 'a', title: ' Activity ', nodeType: 'Group' }), 'activity')).toBe(true);
    expect(isSectionRoot(row({ id: 'a', title: 'Activity', nodeType: 'Item' }), 'activity')).toBe(false);
    expect(isSectionRoot(row({ id: 'a', title: 'Activity', nodeType: 'Page', parentNodeId: 'p' }), 'activity')).toBe(false);
    expect(isSectionRoot(row({ id: 'a', title: 'Setup', nodeType: 'Page' }), 'activity')).toBe(false);
  });

  it('reports page results, section states, issues and command versions', () => {
    expect(pageResult({ applicable: true, isComplete: true })).toBe('CLOSED');
    expect(pageResult({ applicable: true, isComplete: false })).toBe('OPEN');
    expect(pageResult({ applicable: false, isComplete: true })).toBe('N/A');
    expect(pageResult(undefined)).toBe('OPEN');
    expect(sectionStatus(section('not_applicable', null, true)).label).toBe('Confirmed empty');
    expect(sectionStatus(section('invalid', null)).tone).toBe('alert');
    expect(checklistIssues(['unsectioned:a', 'unsectioned:b', 'mystery'])).toHaveLength(2);
    expect(commandVersion({ version: 9 })).toBe(9);
    expect(commandVersion({ version: '9' })).toBeNull();
    expect(commandVersion(null)).toBeNull();
  });
});

describe('checklist home', () => {
  const html = renderToStaticMarkup(createElement(ChecklistWorkspace, props()));

  it('shows Setup, Activity and Closure as three tables in sheet order', () => {
    const order = ['id="setup"', 'id="activity"', 'id="closure"'].map(id => html.indexOf(id));
    expect(order.every(index => index > 0)).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(html.match(/<table/g)).toHaveLength(3);
    for (const heading of ['Done', 'Type', 'Progress', 'Item', 'Links', 'Est.', 'Elapsed']) expect(html).toContain(`>${heading}</th>`);
    expect(html).not.toContain('<details');
  });

  it('gives an editable item one-tap Yes / No / N/A and a linked row only No / N/A', () => {
    expect(html).toContain('aria-label="Completion of Draw section A"');
    expect(html).toMatch(/aria-label="Completion of Survey mission"[^]*?>No<[^]*?>N\/A</);
    expect(html).not.toMatch(/aria-label="Completion of Survey mission"[^<]*<button[^>]*>Yes</);
    expect(html).not.toContain('aria-label="Completion of Structural review"');
  });

  it('opens a Page as its own table and shows row details', () => {
    expect(html).toContain(`href="/tasks/Sep26_T5/checklist?checklist=${CHECKLIST}&amp;parent=page-1&amp;section=activity"`);
    expect(html).toContain('1 h 30 min');
    expect(html).toContain('1 h');
    expect(html).toContain('aria-label="Link 1 for Draw section A"');
    expect(html).toContain('Next rows');
  });

  it('adds rows inside the section root and explains rollup issues in words', () => {
    expect(html).toContain('name="parent_id" value="activity-root"');
    expect(html).toContain('a manager must map it');
    expect(html).not.toContain('unsectioned:');
  });

  it('is read-only for viewers who cannot change it', () => {
    const viewer = renderToStaticMarkup(createElement(ChecklistWorkspace, props({ executor: false })));
    expect(viewer).not.toContain('aria-label="Completion of');
    expect(viewer).not.toContain('Add a row');
    expect(viewer).toContain('>Yes</span>');
  });
});

describe('checklist page', () => {
  it('shows the page result, breadcrumb and a single table', () => {
    const html = renderToStaticMarkup(createElement(ChecklistWorkspace, props({
      sections: undefined,
      ancestors: [{ nodeId: 'page-1', checklistId: CHECKLIST, title: 'Structural review', ownedChecklistId: null }],
      page: { nodeId: 'page-1', section: 'activity', rows: [row({ id: 'child', title: 'Check beams', parentNodeId: 'page-1' })], cursor: 0, nextCursor: null },
    })));
    expect(html.match(/<table/g)).toHaveLength(1);
    expect(html).toContain('OPEN');
    expect(html).toContain('aria-current="page">Structural review');
    expect(html).toContain('name="parent_id" value="page-1"');
  });
});
