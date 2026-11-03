import { describe, expect, it } from 'vitest';

import { learningCounts, mapLearnings } from '@/modules/learning/internal/rules';

describe('mission learnings payload', () => {
  it('maps the database payload and drops malformed rows', () => {
    const mapped = mapLearnings({
      canAdd: true,
      items: [
        { id: 'a', kind: 'mistake', body: 'Wrong cable', authorName: 'Asha', createdAt: '2026-11-03T10:00:00Z', edited: true, canEdit: true },
        { id: 'b', kind: 'learning', body: 'Book early', authorName: null, createdAt: '2026-11-02T10:00:00Z', edited: false, canEdit: false },
        { id: 'c', kind: 'other', body: 'Dropped' },
        null,
      ],
    });
    expect(mapped?.canAdd).toBe(true);
    expect(mapped?.items.map((item) => item.id)).toEqual(['a', 'b']);
    expect(mapped?.items[0]).toMatchObject({ kind: 'mistake', edited: true, canEdit: true, authorName: 'Asha' });
    expect(learningCounts(mapped?.items ?? [])).toEqual({ mistake: 1, learning: 1 });
  });

  it('returns null for a payload that is not the read shape', () => {
    expect(mapLearnings(null)).toBeNull();
    expect(mapLearnings([])).toBeNull();
    expect(mapLearnings({ canAdd: true })).toBeNull();
    expect(mapLearnings({ items: [] })).toEqual({ canAdd: false, items: [] });
  });
});
