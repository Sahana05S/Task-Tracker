import { describe, expect, it } from 'vitest';

import { filterNotes, mapNoteCounts, mapQuestNotes } from '../internal/rules';
import { labelledNoteGroups, type LabelledItem } from '@/modules/labels/client';

const label = (slug: string) => ({ id: `id-${slug}`, name: slug, slug, colour: 'neutral', description: null, archived: false });

describe('Quest notes (migration 132)', () => {
  const notes = mapQuestNotes({
    questTitle: 'Outreach', canAdd: true,
    items: [
      { id: 'n2', body: 'Called the wrong vendor', authorName: 'Asha', createdAt: '2026-11-06T10:00:00Z', edited: false, canEdit: true, canDelete: true, labels: [label('mistake'), label('vendor')] },
      { id: 'n1', body: 'Book site visits a day ahead', authorName: 'Dev', createdAt: '2026-11-05T10:00:00Z', edited: true, canEdit: false, canDelete: true, labels: [label('learning')] },
      { id: 7, body: 'malformed' },
    ],
  });

  it('maps the panel read and drops malformed rows', () => {
    expect(notes?.questTitle).toBe('Outreach');
    expect(notes?.canAdd).toBe(true);
    expect(notes?.items.map((n) => [n.id, n.labels.map((l) => l.slug)])).toEqual([['n2', ['mistake', 'vendor']], ['n1', ['learning']]]);
    expect(mapQuestNotes(null)).toBeNull();
    expect(mapQuestNotes({ items: 'x' })).toBeNull();
  });

  it('filters by a label slug, keeping the newest-first order', () => {
    expect(filterNotes(notes!.items, 'mistake').map((n) => n.id)).toEqual(['n2']);
    expect(filterNotes(notes!.items, null).map((n) => n.id)).toEqual(['n2', 'n1']);
    expect(filterNotes(notes!.items, 'idea')).toEqual([]);
  });

  it('keeps only positive whole counts for the row badges', () => {
    expect(mapNoteCounts({ a: 2, b: 0, c: 1.5, d: 'x' })).toEqual({ a: 2 });
    expect(mapNoteCounts(null)).toEqual({});
  });

  it('groups a label page\'s notes by mission and Quest', () => {
    const note = (id: string, taskTag: string, nodeId: string, nodeTitle: string): LabelledItem => ({
      kind: 'mission_learning', id, title: id, taskTag, date: null, status: null, taskId: null, nodeId, nodeTitle, listId: 'list', rootList: true, meetingId: null,
    });
    const groups = labelledNoteGroups([note('a', 'T1', 'q1', 'Outreach'), note('b', 'T2', 'q3', 'Design'), note('c', 'T1', 'q1', 'Outreach'), note('d', 'T1', 'q2', 'Survey'),
      { ...note('e', 'T1', 'q1', 'Outreach'), kind: 'task' }]);
    expect(groups.map((g) => [g.taskTag, g.quests.map((q) => [q.nodeTitle, q.notes.map((n) => n.id)])])).toEqual([
      ['T1', [['Outreach', ['a', 'c']], ['Survey', ['d']]]],
      ['T2', [['Design', ['b']]]],
    ]);
  });
});
