import { describe, expect, it } from 'vitest';

import { conductBlocks, DEFAULT_CONDUCT_BODY } from '@/modules/hr/client';

describe('Code of Conduct text', () => {
  it('reads headings, bullet lists and paragraphs', () => {
    expect(conductBlocks('Intro line one\nline two\n\n# 1. Honesty\n- Be truthful.\n* Declare interests.\nAfter list.\r\n\n# 2. Safety')).toEqual([
      { kind: 'paragraph', text: 'Intro line one line two' },
      { kind: 'heading', text: '1. Honesty' },
      { kind: 'list', items: ['Be truthful.', 'Declare interests.'] },
      { kind: 'paragraph', text: 'After list.' },
      { kind: 'heading', text: '2. Safety' },
    ]);
  });

  it('keeps the starting draft within the database limit and in eight sections', () => {
    expect(DEFAULT_CONDUCT_BODY.length).toBeLessThan(20000);
    expect(conductBlocks(DEFAULT_CONDUCT_BODY).filter(block => block.kind === 'heading')).toHaveLength(8);
  });
});
