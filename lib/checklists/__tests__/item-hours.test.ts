import { describe, expect, it } from 'vitest';

import { groupItemHours, type ItemHourLog } from '@/lib/checklists/item-hours';

const log = (taskId: string, nodeId: string, hours: number, nodeTitle = nodeId): ItemHourLog =>
  ({ taskId, taskTag: taskId.toUpperCase(), taskTitle: `Task ${taskId}`, nodeId, nodeTitle, hours });

describe('hours by checklist item', () => {
  it('groups tagged logs by task and item, largest first', () => {
    const grouped = groupItemHours([
      log('t1', 'a', 0.5, 'Fridge magnet'), log('t1', 'a', 0.25, 'Fridge magnet'), log('t1', 'b', 1, 'Vase'),
      log('t2', 'c', 0.2, 'Banner'),
    ]);
    expect(grouped.map(t => [t.taskTag, t.hours])).toEqual([['T1', 1.75], ['T2', 0.2]]);
    expect(grouped[0].items).toEqual([
      { nodeId: 'b', title: 'Vase', hours: 1, entries: 1 },
      { nodeId: 'a', title: 'Fridge magnet', hours: 0.75, entries: 2 },
    ]);
  });

  it('orders ties by name and ignores non-finite hours', () => {
    const grouped = groupItemHours([log('t1', 'z', 1, 'Zeta'), log('t1', 'y', 1, 'Alpha'), log('t1', 'x', Number.NaN)]);
    expect(grouped[0].items.map(i => i.title)).toEqual(['Alpha', 'Zeta']);
    expect(groupItemHours([])).toEqual([]);
  });
});
