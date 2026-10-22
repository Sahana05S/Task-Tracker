import { describe, expect, it } from 'vitest';

import { BEAVER_HINTS, beaverHint } from '@/modules/workspace-views/components/shell/beaver-messages';

describe('beaver hints', () => {
  it('picks the most specific route', () => {
    expect(beaverHint('/tasks')?.key).toBe('/tasks');
    expect(beaverHint('/tasks/TT-12')?.key).toBe('/tasks/');
    expect(beaverHint('/team/activity')?.key).toBe('/team/activity');
    expect(beaverHint('/team/E1/reports')?.key).toBe('/team');
    expect(beaverHint('/records/attendance/1/history')?.key).toBe('/records/');
  });

  it('does not match a route that only shares a prefix', () => {
    expect(beaverHint('/tasksx')).toBeNull();
    expect(beaverHint('/')).toBeNull();
  });

  it('has one short sentence or two per route, without codes', () => {
    for (const [prefix, hint] of BEAVER_HINTS) {
      expect(prefix).toMatch(/^\//);
      expect(hint.length).toBeLessThanOrEqual(110);
      expect(hint).not.toMatch(/_|\bM\d{2}\b/);
    }
    expect(new Set(BEAVER_HINTS.map(([prefix]) => prefix)).size).toBe(BEAVER_HINTS.length);
  });
});
