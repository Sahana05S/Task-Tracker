import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ToolsPreview } from '@/modules/tasks/internal/tools/contract';
import { ALL, EMPTY_FILTERS } from '@/modules/tasks/internal/filters';
import { buildRecentOperations, type LineageRow } from '@/modules/tasks/internal/tools/recent';
import type { Task, User } from '@/types/tracker';

// The server actions are mocked so the hook's preview -> commit path runs alone.
const actions = vi.hoisted(() => ({
  previewTaskTool: vi.fn(),
  commitTaskTool: vi.fn(),
}));
vi.mock('@/modules/tasks/tool-actions', () => actions);

const { commitToolPreview, requestToolPreview } = await import('@/modules/tasks/components/tools/use-tool-operation');
const { BulkActionBar } = await import('@/modules/tasks/components/bulk-action-bar');
const { buildPayload } = await import('@/modules/tasks/components/tools/operation-drawer');
const { canCopy, operationsFor, reasonRequired } = await import('@/modules/tasks/components/tools/operations');
const { headerState, pruneSelection, toggleRow, toggleVisible } = await import('@/modules/tasks/components/mission-selection');
const { filtersFromParams, missionsHref } = await import('@/modules/tasks/components/filter-params');

function makeTask(overrides: Partial<Task> & { id: string; taskTag: string }): Task {
  return {
    title: 'Mission',
    category: 'T',
    description: null,
    comments: null,
    assigneeId: 'u1',
    reviewerId: null,
    assigneeIds: ['u1'],
    reviewerIds: [],
    taskScale: 10,
    progressPercentage: 0,
    scaledProgress: 0,
    taskProductivity: null,
    priority: 'Medium',
    status: 'In Progress',
    freshness: 'Fresh',
    validForMetrics: false,
    assignedDate: '2026-10-01',
    dueDate: null,
    completedDate: null,
    metDeadline: null,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    ...overrides,
  };
}

const PREVIEW: ToolsPreview = {
  id: 'preview-1',
  expiresAt: '2026-10-21T10:15:00Z',
  command: 'bulk_done',
  policyId: 'm09-approved-2026-10-13',
  ready: true,
  reasons: [],
  items: [],
  sourceScaleBefore: null,
  sourceScaleAfter: null,
  inheritance: {},
};

describe('tool operation hook: preview then commit', () => {
  beforeEach(() => {
    actions.previewTaskTool.mockReset();
    actions.commitTaskTool.mockReset();
  });

  it('previews, mints one operation key and commits the reviewed preview with it', async () => {
    actions.previewTaskTool.mockResolvedValue({ success: true, data: PREVIEW });
    actions.commitTaskTool.mockResolvedValue({ success: true, data: { items: [{ taskId: 't1', taskTag: 'Oct26_T1', status: 'committed' }] } });

    const preview = await requestToolPreview('bulk_done', { taskIds: ['t1'] }, () => 'key-1');
    expect(actions.previewTaskTool).toHaveBeenCalledWith('bulk_done', { taskIds: ['t1'] });
    expect(preview).toEqual({ ok: true, preview: PREVIEW, operationKey: 'key-1' });

    const commit = await commitToolPreview(PREVIEW.id, 'key-1');
    expect(actions.commitTaskTool).toHaveBeenCalledWith('preview-1', 'key-1');
    expect(commit).toEqual({ ok: true, result: { items: [{ taskId: 't1', taskTag: 'Oct26_T1', status: 'committed' }] } });
  });

  it('passes a refused preview or commit through as a message', async () => {
    actions.previewTaskTool.mockResolvedValue({ success: false, error: 'Task manager required' });
    expect(await requestToolPreview('archive', { taskIds: ['t1'] })).toEqual({ ok: false, message: 'Task manager required' });

    actions.commitTaskTool.mockResolvedValue({ success: false, error: 'Preview expired; prepare a new preview' });
    expect(await commitToolPreview('preview-1', 'key-1')).toEqual({ ok: false, message: 'Preview expired; prepare a new preview' });
  });

  it('keeps the key for a retry when the commit reply is lost', async () => {
    actions.commitTaskTool.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ success: true, data: { items: [] } });
    const lost = await commitToolPreview('preview-1', 'key-1');
    expect(lost.ok).toBe(false);
    expect(lost.ok ? '' : lost.message).toMatch(/same preview and key/);
    await commitToolPreview('preview-1', 'key-1');
    expect(actions.commitTaskTool).toHaveBeenNthCalledWith(2, 'preview-1', 'key-1');
  });

  it('builds the batch payload from the selection and the copy payload from one source', () => {
    const tasks = [makeTask({ id: 't1', taskTag: 'T1' }), makeTask({ id: 't2', taskTag: 'T2' })];
    const section = new FormData();
    section.set('section', 'closure');
    section.set('intentionalEmpty', 'false');
    section.set('reason', '  checked on site  ');
    expect(buildPayload('section', tasks, section)).toEqual({
      taskIds: ['t1', 't2'],
      section: 'closure',
      intentionalEmpty: false,
      reason: 'checked on site',
    });

    const phases = new FormData();
    phases.set('startDate', '2026-10-21');
    phases.set('count', '3');
    phases.set('phaseDays', '5');
    phases.set('reason', '');
    expect(buildPayload('day_count', tasks.slice(0, 1), phases)).toEqual({
      sourceTaskId: 't1',
      startDate: '2026-10-21',
      count: 3,
      phaseDays: 5,
    });
  });
});

describe('selection on the Missions table', () => {
  it('drops rows hidden by a filter and keeps the same set when nothing changed', () => {
    const selected = new Set(['t1', 't2', 't3']);
    expect([...pruneSelection(selected, ['t1', 't3', 't9'])]).toEqual(['t1', 't3']);
    expect(pruneSelection(selected, ['t1', 't2', 't3', 't4'])).toBe(selected);
  });

  it('header checkbox covers the visible rows only', () => {
    const visible = ['t1', 't2'];
    expect(headerState(new Set(), visible)).toBe(false);
    expect(headerState(new Set(['t1']), visible)).toBe('indeterminate');
    expect(headerState(new Set(['t1', 't2']), visible)).toBe(true);
    expect([...toggleVisible(new Set(['t1']), visible)]).toEqual(['t1', 't2']);
    expect(toggleVisible(new Set(['t1', 't2']), visible).size).toBe(0);
    expect([...toggleRow(new Set(['t1']), 't1')]).toEqual([]);
  });
});

describe('bulk action bar', () => {
  const render = (selectedCount: number, canManage: boolean) =>
    renderToStaticMarkup(createElement(BulkActionBar, { selectedCount, canManage, onRun: () => {}, onClear: () => {} }));
  const buttons = (html: string) => [...html.matchAll(/<button[^>]*>([^<]+)/g)].map((match) => match[1]);

  it('is hidden with nothing selected', () => {
    expect(render(0, true)).toBe('');
  });

  it('enables Copy only at exactly one selected row', () => {
    expect(canCopy(0)).toBe(false);
    expect(canCopy(1)).toBe(true);
    expect(canCopy(2)).toBe(false);
    expect(render(1, true)).toMatch(/<button(?![^>]*disabled="")[^>]*>Copy…/);
    expect(render(2, true)).toMatch(/<button[^>]*disabled=""[^>]*>Copy…/);
    expect(render(2, true)).toContain('Copy needs exactly one selected mission');
  });

  it('gives managers every batch action and the copy menu', () => {
    expect(buttons(render(3, true))).toEqual(['Done', 'Reopen', 'Confirm section', 'Refresh', 'Archive', 'Copy…']);
  });

  it('gives members Done and Refresh only', () => {
    const html = render(2, false);
    expect(buttons(html)).toEqual(['Done', 'Refresh']);
    expect(html).not.toContain('Copy');
    expect(operationsFor(false, 'copy')).toEqual([]);
    expect(operationsFor(false, 'batch').map((operation) => operation.command)).toEqual(['bulk_done', 'refresh']);
  });

  it('asks for a reason where the database requires one', () => {
    expect(reasonRequired('archive')).toBe(true);
    expect(reasonRequired('bulk_done')).toBe(false);
    expect(reasonRequired('support', 'split-even')).toBe(true);
    expect(reasonRequired('support', 'absolute')).toBe(false);
  });
});

describe('Missions filters in the URL', () => {
  it('round-trips the view and the narrowed filters', () => {
    const filters = { ...EMPTY_FILTERS, search: 'slab', status: 'Done' as const, category: 'PJT' as const };
    const href = missionsHref('table', filters);
    expect(href).toBe('/tasks?view=table&q=slab&type=PJT&status=Done');
    expect(filtersFromParams(new URL(href, 'http://x').searchParams)).toEqual(filters);
    expect(missionsHref('cards')).toBe('/tasks');
  });

  it('ignores unknown values', () => {
    const filters = filtersFromParams(new URLSearchParams('status=Nope&priority=Focus&fresh=Mouldy'));
    expect(filters.status).toBe(ALL);
    expect(filters.priority).toBe('Focus');
    expect(filters.freshness).toBe(ALL);
  });
});

describe('recent operations', () => {
  const members = [{ id: 'md', fullName: 'Harish', employeeId: 'E1', email: 'md@example.test', role: 'managing_director', isActive: true, createdAt: '', updatedAt: '' }] as User[];

  it('groups one commit into one operation and lists archives, newest first', () => {
    const tasks = [
      makeTask({ id: 's', taskTag: 'Oct26_T1' }),
      makeTask({ id: 'c1', taskTag: 'Oct26_T3' }),
      makeTask({ id: 'c2', taskTag: 'Oct26_T2' }),
      makeTask({ id: 'old', taskTag: 'Sep26_T9', archivedEffectiveDate: '2026-10-20', archiveReason: 'Superseded' }),
      makeTask({ id: 'carried', taskTag: 'Sep26_T4', archivedEffectiveDate: '2026-10-21', archiveReason: 'Month end', handoffSuccessorId: 'next' }),
      makeTask({ id: 'next', taskTag: 'Oct26_T4' }),
    ];
    const at = '2026-10-21T06:00:00.000Z';
    const lineage: LineageRow[] = [
      { predecessorTaskId: 's', successorTaskId: 'c1', relationType: 'Related', createdBy: 'md', createdAt: at },
      { predecessorTaskId: 's', successorTaskId: 'c2', relationType: 'Related', createdBy: 'md', createdAt: at },
      { predecessorTaskId: 'carried', successorTaskId: 'next', relationType: 'Carryover', createdBy: 'md', createdAt: '2026-10-21T05:00:00.000Z' },
      { predecessorTaskId: 's', successorTaskId: 'hidden', relationType: 'Related', createdBy: 'md', createdAt: '2026-10-19T05:00:00.000Z' },
    ];

    const operations = buildRecentOperations(lineage, tasks, members);
    expect(operations.map((operation) => [operation.kind, operation.tasks.map((task) => task.taskTag)])).toEqual([
      ['copy', ['Oct26_T2', 'Oct26_T3']],
      ['carryover', ['Oct26_T4']],
      ['archive', ['Sep26_T9']],
    ]);
    expect(operations[0]).toMatchObject({ actorName: 'Harish', source: { taskTag: 'Oct26_T1' } });
    expect(operations[1].reason).toBe('Month end');
  });
});
