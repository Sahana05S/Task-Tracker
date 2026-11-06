import { describe, expect, it } from 'vitest';

import { filterNotes, hasNoteType, hashtagLine, mapNoteHashtags, mapNotes, noteHashtagCounts, noteTypeLabels } from '@/modules/learning/internal/rules';

const tag = (slug: string, noteType = false) => ({ id: `id-${slug}`, name: slug, slug, colour: 'neutral', description: null, archived: false, noteType });

describe('mission notes payload', () => {
  const mapped = mapNotes({
    canAdd: true,
    items: [
      { id: 'a', body: 'Wrong cable', authorName: 'Asha', createdAt: '2026-11-06T10:00:00Z', edited: true, canEdit: true, canDelete: true,
        nodeId: null, labels: [tag('mistake', true), tag('client'), { id: 1 }] },
      { id: 'b', body: 'Rain on pour day', authorName: null, createdAt: '2026-11-05T10:00:00Z', canDelete: true,
        nodeId: 'q1', nodeTitle: 'Foundation', nodeKind: 'quest', labels: [tag('risk', true), tag('site')] },
      { id: 'c', body: 'Odd kind', nodeId: 'o1', nodeKind: 'page', labels: 'x' },
      { id: 'd', kind: 'mistake' },
      null,
    ],
  });

  it('maps the database payload and drops malformed rows and labels', () => {
    expect(mapped?.canAdd).toBe(true);
    expect(mapped?.items.map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(mapped?.items[0]).toMatchObject({ edited: true, canEdit: true, canDelete: true, authorName: 'Asha', nodeId: null, nodeKind: null });
    expect(mapped?.items[0].labels.map((label) => label.slug)).toEqual(['mistake', 'client']);
    expect(mapped?.items[1]).toMatchObject({ canEdit: false, canDelete: true, nodeId: 'q1', nodeTitle: 'Foundation', nodeKind: 'quest' });
    expect(mapped?.items[2]).toMatchObject({ nodeKind: null, labels: [] });
  });

  it('filters by hashtag and by Quest or objective, and counts hashtags types first', () => {
    const items = mapped?.items ?? [];
    expect(filterNotes(items, 'site').map((n) => n.id)).toEqual(['b']);
    expect(filterNotes(items, null, 'q1').map((n) => n.id)).toEqual(['b']);
    expect(filterNotes(items, 'client', 'q1')).toEqual([]);
    expect(filterNotes(items, null).length).toBe(3);
    expect(noteHashtagCounts(items).map(({ label, count }) => `${label.slug}:${count}`)).toEqual(['mistake:1', 'risk:1', 'client:1', 'site:1']);
    expect(hashtagLine(items[0].labels)).toBe('#mistake #client');
    expect(hasNoteType(items[0].labels)).toBe(true);
    expect(hasNoteType(items[2].labels)).toBe(false);
  });

  it('lists the note types of a catalogue, leaving archived ones out', () => {
    const catalogue = mapNotes({ items: [{ id: 'x', body: 'y', labels: [tag('idea', true), { ...tag('old', true), archived: true }, tag('site')] }] })!.items[0].labels;
    expect(noteTypeLabels(catalogue).map((label) => label.slug)).toEqual(['idea']);
  });

  it('returns null for a payload that is not the read shape', () => {
    expect(mapNotes(null)).toBeNull();
    expect(mapNotes([])).toBeNull();
    expect(mapNotes({ canAdd: true })).toBeNull();
    expect(mapNotes({ items: [] })).toEqual({ canAdd: false, items: [] });
  });

  it('maps the Missions filter read', () => {
    expect(mapNoteHashtags({ t1: ['mistake', 3, 'client'], t2: 'x' })).toEqual({ t1: ['mistake', 'client'], t2: [] });
    expect(mapNoteHashtags(null)).toEqual({});
  });
});
