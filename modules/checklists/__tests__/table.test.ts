import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, replace() {}, push() {} }), usePathname: () => '/tasks/Sep26_T5/checklist', useSearchParams: () => new URLSearchParams() }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => createElement('a', { href, ...rest }, children),
}));

import { checklistIssues, commandVersion, opensTable, pageResult, rowKind, sectionStatus, stateChoices } from '@/modules/checklists/client';
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
    priority: 0, childCount: 0, progressPercentage: 0, applicable: true,
    ...overrides,
  };
}

const section = (state: SectionProgress['state'], progressPercentage: number | null, isComplete = false): SectionProgress =>
  ({ state, progressPercentage, isComplete, applicable: state !== 'not_applicable' });

const rollup: ChecklistRollup = {
  contract: 'm05-checklist-v1',
  sections: { setup: section('complete', 100, true), activity: section('partial', 40), closure: section('not_applicable', null, true) },
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
    checklist: { id: CHECKLIST, title: 'Master checklist' },
    ancestors: [],
    rollup,
    version: 7,
    sections: [
      { section: 'setup', rows: [row({ id: 'setup-1', title: 'Brief confirmed', section: 'setup', completionState: 'Yes', isComplete: true, progressPercentage: 100 })], cursor: 0, nextCursor: null },
      { section: 'activity', rows: [
        row({ id: 'item-1', title: 'Draw section A', estimatedMinutes: 90, links: ['https://example.com/a'], elapsedSeconds: 3600 }),
        row({ id: 'page-1', title: 'Structural review', childCount: 3, progressPercentage: 50 }),
        row({ id: 'linked-1', title: 'Survey mission', linkedTaskId: '33333333-3333-4333-8333-333333333333' }),
      ], cursor: 0, nextCursor: 50 },
      { section: 'closure', rows: [], cursor: 0, nextCursor: null },
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
  it('has one kind of row: ticked, or rolled up from the rows under it, or linked', () => {
    expect(rowKind(row({ id: 'a', title: 'a' }))).toBe('item');
    // An empty Page or Group from an older checklist is an ordinary row.
    expect(rowKind(row({ id: 'a', title: 'a', nodeType: 'Group' }))).toBe('item');
    expect(rowKind(row({ id: 'a', title: 'a', nodeType: 'Page', childCount: 1 }))).toBe('parent');
    expect(rowKind(row({ id: 'a', title: 'a', childCount: 2 }))).toBe('parent');
    expect(rowKind(row({ id: 'a', title: 'a', linkedTaskId: 'x' }))).toBe('linked');
    expect(stateChoices('item')).toEqual(['Yes', 'No', 'N/A']);
    expect(stateChoices('linked')).toEqual(['No', 'N/A']);
    expect(stateChoices('parent')).toEqual([]);
    expect(opensTable('parent')).toBe(true);
    expect(opensTable('item')).toBe(false);
  });

  it('reports page results, section states, issues and command versions', () => {
    expect(pageResult({ applicable: true, isComplete: true })).toBe('CLOSED');
    expect(pageResult({ applicable: true, isComplete: false })).toBe('OPEN');
    expect(pageResult({ applicable: false, isComplete: true })).toBe('N/A');
    expect(pageResult(undefined)).toBe('OPEN');
    expect(sectionStatus(section('not_applicable', null, true)).label).toBe('No rows (N/A)');
    expect(sectionStatus(section('invalid', null)).tone).toBe('alert');
    expect(checklistIssues(['unsectioned:a', 'unsectioned:b', 'mystery'])).toHaveLength(2);
    // Every code the database can report has its own sentence.
    for (const code of ['duplicate_node', 'unsectioned', 'missing_parent', 'cross_section', 'missing_or_cross_parent', 'cycle', 'checklist_cycle',
      'missing_node', 'linked_unavailable', 'linked_parent', 'linked_done_mismatch', 'empty_group', 'empty_unconfirmed']) {
      expect(checklistIssues([`${code}:x`])[0]).not.toBe(checklistIssues(['mystery'])[0]);
    }
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
    // Closure has no rows, so it says so instead of drawing an empty table.
    expect(html.match(/<table/g)).toHaveLength(2);
    expect(html).toContain('No closure rows yet. An empty section counts as N/A.');
    for (const heading of ['Done', 'Progress', 'Item', 'Links', 'Est.', 'Elapsed']) expect(html).toContain(`>${heading}</th>`);
    expect(html).not.toContain('>Type</th>');
    // No 'Add sub-mission' choice for a member (68 offers it to managers only).
    expect(html).not.toContain('>Sub-mission</button>');
    expect(html).not.toContain('<details');
  });

  it('gives an editable item one-tap Yes / No / N/A and a linked row only No / N/A', () => {
    expect(html).toContain('aria-label="Completion of Draw section A"');
    expect(html).toMatch(/aria-label="Completion of Survey mission"[^]*?>No<[^]*?>N\/A</);
    expect(html).not.toMatch(/aria-label="Completion of Survey mission"[^<]*<button[^>]*>Yes</);
    expect(html).not.toContain('aria-label="Completion of Structural review"');
  });

  it('opens a row with rows under it as its own table and shows row details', () => {
    expect(html).toContain(`href="/tasks/Sep26_T5/checklist?checklist=${CHECKLIST}&amp;parent=page-1&amp;section=activity"`);
    expect(html).toContain('3 rows inside');
    expect(html).toContain('Sub-mission');
    expect(html).toContain('1 h 30 min');
    expect(html).toContain('1 h');
    expect(html).toContain('aria-label="Link 1 for Draw section A"');
    expect(html).toContain('Next rows');
  });

  it('adds rows at the top of each section with no type to choose, and explains issues in words', () => {
    expect(html).toContain('name="parent_id" value=""');
    expect(html).not.toContain('name="node_type"');
    expect(html).not.toContain('Row type');
    expect(html).toContain('a manager must map it');
    expect(html).not.toContain('unsectioned:');
  });

  it('gives managers the rows that still need a section, and no manual progress switch (66)', () => {
    const manager = renderToStaticMarkup(createElement(ChecklistWorkspace, props({
      manager: true,
      managerTools: { linkChoices: [], unmapped: [{ id: 'old-1', title: 'Old row' }] },
    })));
    expect(manager).not.toContain('Progress: manual');
    expect(manager).toContain('Mission progress, from Activity');
    expect(manager).toContain('Rows without a section');
    expect(manager).toContain('name="node_id" value="old-1"');
    expect(manager).not.toContain('Structure and linked missions');
    expect(html).not.toContain('Progress: manual');
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
      ancestors: [{ nodeId: 'page-1', checklistId: CHECKLIST, title: 'Structural review' }],
      page: { nodeId: 'page-1', section: 'activity', rows: [row({ id: 'child', title: 'Check beams', parentNodeId: 'page-1' })], cursor: 0, nextCursor: null },
    })));
    expect(html.match(/<table/g)).toHaveLength(1);
    expect(html).toContain('OPEN');
    expect(html).toMatch(/aria-current="page"[^>]*>Structural review</);
    expect(html).toContain('name="parent_id" value="page-1"');
    expect(html).toContain('Rows under Structural review');
  });
});
