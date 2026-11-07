import { describe, expect, it } from 'vitest';
import { parseChecklistCommand } from '../internal/input';
import { buildMoveTargets, moveBlockedReason } from '../internal/move-target-rules';

function form(fields: Record<string, string>) {
  const data = new FormData();
  Object.entries({ command: 'move', taskId: 'task', expectedVersion: '4', operationId: 'op', checklist_id: 'root', node_id: 'row', ...fields })
    .forEach(([key, value]) => data.set(key, value));
  return data;
}

describe('move to Quest (migration 133)', () => {
  it('sends a target list, or a new Quest with its title and owner', () => {
    const into = parseChecklistCommand(form({ target_list_id: 'quest-a' }));
    expect(into.ok && into.value.payload).toEqual({ node_id: 'row', target_list_id: 'quest-a', checklist_id: 'root' });
    const fresh = parseChecklistCommand(form({ target_list_id: 'new', new_quest_title: ' Survey ', new_quest_assignee_id: 'user-8' }));
    expect(fresh.ok && fresh.value.payload).toEqual({ node_id: 'row', new_quest: { title: 'Survey', assignee_id: 'user-8' }, checklist_id: 'root' });
    const mine = parseChecklistCommand(form({ target_list_id: 'new', new_quest_title: 'Mine' }));
    expect(mine.ok && mine.value.payload.new_quest).toEqual({ title: 'Mine', assignee_id: null });
    expect(parseChecklistCommand(form({ target_list_id: 'new' }))).toEqual({ ok: false, error: 'Give the new Quest a title.' });
    expect(parseChecklistCommand(form({}))).toEqual({ ok: false, error: 'Choose where to move this row.' });
  });

  const data = [
    { checklistId: 'root', nodeId: null, parentChecklistId: null, title: 'Main list', canEdit: true },
    { checklistId: 'qa', nodeId: 'na', parentChecklistId: 'root', title: 'Quest A', assigneeName: 'Padma', canEdit: true },
    { checklistId: 'qb', nodeId: 'nb', parentChecklistId: 'root', title: 'Quest B', assigneeName: 'Ravi', canEdit: false },
    { checklistId: 'qa1', nodeId: 'na1', parentChecklistId: 'qa', title: 'Inner', canEdit: true },
  ];

  it('orders the lists as a tree: the main list, each Quest and then the Quests inside it', () => {
    const targets = buildMoveTargets(data);
    expect(targets.map((t) => [t.title, t.depth])).toEqual([['Main list', 0], ['Quest A', 1], ['Inner', 2], ['Quest B', 1]]);
    expect(targets[2].path).toEqual(['root', 'qa']);
    expect(buildMoveTargets(null)).toEqual([]);
  });

  it('marks the row\'s own list, its own Quests and lists the viewer may not change', () => {
    const targets = buildMoveTargets(data);
    const byTitle = (title: string) => targets.find((t) => t.title === title)!;
    const objective = { checklistId: 'root' };
    expect(moveBlockedReason(byTitle('Main list'), objective)).toBe('This row is here');
    expect(moveBlockedReason(byTitle('Quest A'), objective)).toBeNull();
    expect(moveBlockedReason(byTitle('Quest B'), objective)).toBe('Only Ravi, the owners above and managers');
    const questA = { checklistId: 'root', ownedChecklistId: 'qa' };
    expect(moveBlockedReason(byTitle('Quest A'), questA)).toBe('Inside this Quest');
    expect(moveBlockedReason(byTitle('Inner'), questA)).toBe('Inside this Quest');
  });
});
