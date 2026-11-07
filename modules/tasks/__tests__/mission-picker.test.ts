import { describe, expect, it } from 'vitest';

import { orderMissionOptions, searchMissionOptions, type MissionPickerOption } from '@/modules/tasks/client';

const option = (id: string, tag: string, over: Partial<MissionPickerOption> = {}): MissionPickerOption => ({
  id, tag, title: `Mission ${tag}`, status: null, parentId: null, isPermanent: false, businessId: null, ...over,
});

describe('mission picker order', () => {
  const options = [
    option('b', 'T2'),
    option('c1', 'T3', { parentId: 'a' }),
    option('p', 'P1', { isPermanent: true }),
    option('a', 'T1'),
    option('c2', 'T4', { parentId: 'c1' }),
    option('orphan', 'T5', { parentId: 'gone' }),
  ];

  it('puts permanent missions first, then missions with their sub-missions indented', () => {
    expect(orderMissionOptions(options).map((o) => [o.tag, o.depth])).toEqual([
      ['P1', 0], ['T1', 0], ['T3', 1], ['T4', 2], ['T2', 0], ['T5', 0],
    ]);
  });

  it('lists every mission once even when sub-mission links loop', () => {
    const looped = [option('x', 'X', { parentId: 'y' }), option('y', 'Y', { parentId: 'x' })];
    expect(orderMissionOptions(looped).map((o) => o.tag).sort()).toEqual(['X', 'Y']);
  });

  it('searches by tag or title and keeps the parents of a match', () => {
    const ordered = orderMissionOptions(options);
    expect(searchMissionOptions(ordered, 't4').map((o) => o.tag)).toEqual(['T1', 'T3', 'T4']);
    expect(searchMissionOptions(ordered, '').length).toBe(options.length);
  });
});
