import { describe, expect, it } from 'vitest';

import { resolveSubMissionOrigin, type SubMissionOriginRow } from '@/modules/tasks/client';

const CHECKLIST = '11111111-1111-4111-8111-111111111111';
const PARENT_ROW = '22222222-2222-4222-8222-222222222222';
const ROW = '33333333-3333-4333-8333-333333333333';

const row = (overrides: Partial<SubMissionOriginRow> = {}): SubMissionOriginRow => ({
  id: ROW,
  title: 'Beam design',
  checklistId: CHECKLIST,
  parentNodeId: PARENT_ROW,
  section: 'activity',
  containerTitle: 'Structure',
  ...overrides,
});

describe('resolveSubMissionOrigin', () => {
  it('links the exact parent row when it is readable', () => {
    const origin = resolveSubMissionOrigin({ taskTag: 'ST-12' }, row());
    expect(origin).toEqual({
      kind: 'row',
      parentTag: 'ST-12',
      href: `/tasks/ST-12/checklist?checklist=${CHECKLIST}&parent=${PARENT_ROW}&section=activity&item=${ROW}`,
      label: 'Structure',
      path: 'Structure › Beam design',
    });
  });

  it('uses the row title and the checklist top level when the row has no container', () => {
    const origin = resolveSubMissionOrigin({ taskTag: 'ST 1' }, row({ parentNodeId: null, containerTitle: null, section: null }));
    expect(origin).toMatchObject({
      kind: 'row',
      href: `/tasks/ST%201/checklist?checklist=${CHECKLIST}&section=activity&item=${ROW}`,
      label: 'Beam design',
      path: 'Beam design',
    });
  });

  it('falls back to the parent mission when the parent checklist is not readable', () => {
    expect(resolveSubMissionOrigin({ taskTag: 'ST-12' }, null)).toEqual({ kind: 'mission', parentTag: 'ST-12', href: '/tasks/ST-12' });
  });

  it('is null for a mission without a parent', () => {
    expect(resolveSubMissionOrigin(null, row())).toBeNull();
    expect(resolveSubMissionOrigin(null, null)).toBeNull();
  });
});
