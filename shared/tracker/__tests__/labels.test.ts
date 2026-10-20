import { describe, expect, it } from 'vitest';

import { codeLabel } from '@/shared/tracker/labels';

describe('codeLabel', () => {
  it('uses the written label for known codes', () => {
    expect(codeLabel('not_applicable')).toBe('Not applicable');
    expect(codeLabel('completed_winner')).toBe('Winner chosen');
  });

  it('makes unknown codes readable and drops an id suffix', () => {
    expect(codeLabel('factor_median_unavailable')).toBe('Factor median unavailable');
    expect(codeLabel('unsectioned:3f2a')).toBe('Unsectioned');
  });

  it('falls back when the code is empty', () => {
    expect(codeLabel(null)).toBe('Not recorded');
    expect(codeLabel('', 'Unknown')).toBe('Unknown');
  });
});
