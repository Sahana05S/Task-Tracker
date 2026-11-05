import { describe, expect, it } from 'vitest';

import { ownerFirst } from '@/modules/tasks/internal/input';

describe('Primary row order (migrations 108, 121)', () => {
  it('moves the kept primary to the front, where the database reads it', () => {
    expect(ownerFirst(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b']);
  });

  it('keeps the order when the owner is blank or not selected', () => {
    expect(ownerFirst(['a', 'b'], '')).toEqual(['a', 'b']);
    expect(ownerFirst(['a', 'b'], 'z')).toEqual(['a', 'b']);
    expect(ownerFirst(null, 'a')).toBeNull();
  });
});
