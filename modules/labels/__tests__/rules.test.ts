import { describe, expect, it } from 'vitest';

import { cleanLabelName, labelSlug, labelSuggestions, mapCatalogue, mapLabelled, mapLabelsFor, type Label } from '@/modules/labels/internal/rules';

const label = (name: string, extra: Partial<Label> = {}): Label =>
  ({ id: name, name, slug: labelSlug(name), colour: 'neutral', description: null, archived: false, noteType: false, ...extra });

describe('label names', () => {
  it('derives the slug the database stores', () => {
    expect(labelSlug('Site   Safety!')).toBe('site-safety');
    expect(labelSlug('--Crane--')).toBe('crane');
    expect(labelSlug('###')).toBe('');
    expect(cleanLabelName('  ##Site   safety ')).toBe('Site safety');
  });

  it('suggests open labels not already on the record, prefix matches first', () => {
    const catalogue = [label('Crane'), label('Site crane'), label('Cranes old', { archived: true }), label('Safety')];
    expect(labelSuggestions(catalogue, '#cra', []).map((l) => l.name)).toEqual(['Crane', 'Site crane']);
    expect(labelSuggestions(catalogue, 'cra', [catalogue[0]]).map((l) => l.name)).toEqual(['Site crane']);
    expect(labelSuggestions(catalogue, '#', []).map((l) => l.name)).toEqual(['Crane', 'Site crane', 'Safety']);
  });

  it('reuses the registry when a learning note\'s box gets a typed #name (no second label, no free-text parsing)', () => {
    const catalogue = [label('Mistake'), label('Mistakes log')];
    // Typed with a hash, other case or spacing, the name lands on the existing label's slug, so the box offers it, not "Create".
    for (const typed of ['#mistake', '  ##MISTAKE ', '#Mistake!']) {
      expect(labelSlug(cleanLabelName(typed))).toBe(catalogue[0].slug);
      expect(labelSuggestions(catalogue, typed, [])[0]).toBe(catalogue[0]);
    }
    // Already on the note: nothing new is offered for it.
    expect(labelSuggestions(catalogue, '#mistake', [catalogue[0]]).map((l) => l.name)).toEqual(['Mistakes log']);
  });
});

describe('label payloads', () => {
  it('maps the catalogue, labels_for and labelled, dropping malformed rows and unknown colours', () => {
    const cat = mapCatalogue({ canManage: true, labels: [{ id: 'a', name: 'Crane', slug: 'crane', colour: '#ff0000', uses: 3 }, { id: 1 }] });
    expect(cat).toEqual({ canManage: true, labels: [{ id: 'a', name: 'Crane', slug: 'crane', colour: 'neutral', description: null, archived: false, noteType: false, uses: 3 }] });
    expect(mapLabelsFor({ t1: [{ id: 'a', name: 'Crane', slug: 'crane', colour: 'danger', noteType: true }], t2: 'x' })).toEqual({
      t1: [{ id: 'a', name: 'Crane', slug: 'crane', colour: 'danger', description: null, archived: false, noteType: true }], t2: [],
    });
    const records = mapLabelled({ label: { id: 'a', name: 'Crane', slug: 'crane' }, items: [
      { kind: 'task', id: 't', title: 'Lift', taskTag: 'Nov26_T1', status: 'Done', date: '2026-11-01' },
      { kind: 'mission_learning', id: 'n', title: 'Rain on pour day', taskTag: 'Nov26_T1', taskId: 't', nodeId: 'q', nodeTitle: 'Foundation', date: '2026-11-02', listId: 'l', rootList: false },
      { kind: 'sale', id: 's' },
    ] });
    expect(records?.items).toEqual([
      { kind: 'task', id: 't', title: 'Lift', taskTag: 'Nov26_T1', date: '2026-11-01', status: 'Done', taskId: null, nodeId: null, nodeTitle: null, listId: null, rootList: true },
      { kind: 'mission_learning', id: 'n', title: 'Rain on pour day', taskTag: 'Nov26_T1', date: '2026-11-02', status: null, taskId: 't', nodeId: 'q', nodeTitle: 'Foundation', listId: 'l', rootList: false },
    ]);
    expect(mapCatalogue(null)).toBeNull();
    expect(mapLabelled({ items: [] })).toBeNull();
  });
});
