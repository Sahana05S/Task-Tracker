import { describe, expect, it } from 'vitest';
import { wheelZoomFactor } from '../internal/mission-graph';
import { parseRoadmapLocation, roadmapScope, roadmapSearch } from '../internal/roadmap';

describe('map wheel', () => {
  const wheel = (deltaY: number, mods: { ctrlKey?: boolean; metaKey?: boolean } = {}, deltaMode = 0) => ({ deltaY, deltaMode, ctrlKey: false, metaKey: false, ...mods });
  it('leaves a plain wheel to scroll the page', () => {
    expect(wheelZoomFactor(wheel(100))).toBeNull();
    expect(wheelZoomFactor(wheel(-3))).toBeNull();
  });
  it('zooms on Ctrl or Cmd + wheel, in steps for a mouse and gently for a pinch', () => {
    expect(wheelZoomFactor(wheel(-100, { ctrlKey: true }))!).toBeGreaterThan(1);
    expect(wheelZoomFactor(wheel(100, { metaKey: true }))!).toBeLessThan(1);
    expect(wheelZoomFactor(wheel(-2, { ctrlKey: true }))!).toBeLessThan(1.01);
    expect(wheelZoomFactor(wheel(-5000, { ctrlKey: true }))).toBe(1.25);
    expect(wheelZoomFactor(wheel(3, { ctrlKey: true }, 1))!).toBeLessThan(1);
  });
});

describe('roadmap URL', () => {
  it('round-trips the whole-team scope and leaves the default out of the URL', () => {
    const search = roadmapSearch({ missionId: '00000000-0000-4000-8000-000000000001', section: 'activity' }, 'today', 'roadmap', 'team');
    const query = Object.fromEntries(new URLSearchParams(search.slice(1)));
    expect(roadmapScope(query.scope)).toBe('team');
    expect(parseRoadmapLocation(query)?.missionId).toBe('00000000-0000-4000-8000-000000000001');
    expect(roadmapSearch(null, 'all', 'roadmap', 'mine')).toBe('/today');
    expect(roadmapScope(undefined)).toBe('mine');
    expect(roadmapScope('everyone')).toBe('mine');
  });
  it('ignores a stale layout parameter from the old road map', () => {
    expect(roadmapSearch(null, 'all', 'roadmap')).toBe('/today');
  });
});

describe('business chips in the Today URL (migration 134)', () => {
  it('keeps ?business= while moving around the map', () => {
    expect(roadmapSearch(null, 'all', 'roadmap', 'mine', 'all')).toBe('?business=all');
    expect(roadmapSearch(null, 'today', 'list', 'mine', 'fish-sales,none')).toBe('?business=fish-sales%2Cnone&due=today&view=list');
    expect(roadmapSearch(null, 'today', 'list', 'mine', null)).toBe('?due=today&view=list');
  });
});
