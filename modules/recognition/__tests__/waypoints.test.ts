import { describe, expect, it } from 'vitest';

import {
  CELEBRATION_WINDOW_MS,
  DEFAULT_RECOGNITION_POLICY,
  DEFAULT_WAYPOINTS,
  freshCelebrations,
  missionWaypoints,
  parseRecognitionPolicy,
  parseWaypoints,
  waypointState,
  type WaypointCrossing,
} from '@/modules/recognition/client';

const keys = (s: { reached: { key: string }[] }) => s.reached.map((w) => w.key);
const crossing = (key: string, percent: number, over: Partial<WaypointCrossing> = {}): WaypointCrossing => ({
  key, percent, reachedAt: '2026-10-21T06:00:00.000Z', source: 'progress', mine: true, ...over,
});

describe('waypoint names and thresholds (user decision, 20 October 2026)', () => {
  it('mirrors migration 51: five waypoints, lowest first', () => {
    expect(DEFAULT_WAYPOINTS.map((w) => [w.key, w.label, w.percent])).toEqual([
      ['ignition', 'Ignition', 30],
      ['escape_velocity', 'Escape Velocity', 50],
      ['deep_space', 'Deep Space', 70],
      ['final_approach', 'Final Approach', 90],
      ['landing', 'Landing', 100],
    ]);
  });

  it('avoids the words reserved for the marketing CTA and missions', () => {
    for (const w of DEFAULT_WAYPOINTS) expect(w.label).not.toMatch(/launch|mission/i);
  });
});

describe('waypointState: crossings', () => {
  it('nothing is reached below the first threshold, and Ignition is next', () => {
    expect(waypointState(0)).toEqual({ reached: [], next: DEFAULT_WAYPOINTS[0] });
    expect(keys(waypointState(29.99))).toEqual([]);
    expect(waypointState(null)).toEqual({ reached: [], next: DEFAULT_WAYPOINTS[0] });
  });

  it('a threshold is reached exactly at its percent', () => {
    expect(keys(waypointState(30))).toEqual(['ignition']);
    expect(keys(waypointState(50))).toEqual(['ignition', 'escape_velocity']);
  });

  it('one save can pass several waypoints', () => {
    const s = waypointState(72);
    expect(keys(s)).toEqual(['ignition', 'escape_velocity', 'deep_space']);
    expect(s.next?.key).toBe('final_approach');
  });

  it('Landing at 100% leaves no next waypoint', () => {
    expect(waypointState(100)).toEqual({ reached: DEFAULT_WAYPOINTS, next: null });
  });
});

describe('waypointState: dropped progress keeps reached keys', () => {
  it('stored crossings stay reached when progress falls back', () => {
    const s = waypointState(20, ['ignition', 'escape_velocity']);
    expect(keys(s)).toEqual(['ignition', 'escape_velocity']);
    expect(s.next?.key).toBe('deep_space');
  });

  it('current progress and stored crossings combine (a save not read back yet)', () => {
    expect(keys(waypointState(95, ['ignition']))).toEqual(['ignition', 'escape_velocity', 'deep_space', 'final_approach']);
  });

  it('unknown stored keys (a policy changed later) are ignored', () => {
    expect(keys(waypointState(0, ['old_key']))).toEqual([]);
  });
});

describe('parseWaypoints / parseRecognitionPolicy', () => {
  it('falls back to the defaults before migration 51 or on a malformed list', () => {
    expect(parseWaypoints(undefined)).toBe(DEFAULT_WAYPOINTS);
    expect(parseWaypoints('nope')).toBe(DEFAULT_WAYPOINTS);
    expect(parseWaypoints([{ key: 'Bad Key', label: 'x', percent: 10 }, { key: 'zero', percent: 0 }])).toBe(DEFAULT_WAYPOINTS);
    expect(parseRecognitionPolicy({ milestones: [3] }).waypoints).toBe(DEFAULT_WAYPOINTS);
    expect(DEFAULT_RECOGNITION_POLICY.waypoints).toBe(DEFAULT_WAYPOINTS);
  });

  it('reads the stored list: sorted, valid entries only, first of a duplicate key, label defaults to the key', () => {
    const parsed = parseWaypoints([
      { key: 'landing', label: 'Touchdown', percent: 100 },
      { key: 'half', label: '  Halfway ', percent: 50 },
      { key: 'half', label: 'Duplicate', percent: 60 },
      { key: 'over', label: 'Too far', percent: 120 },
      { key: 'quarter', percent: 25 },
    ]);
    expect(parsed).toEqual([
      { key: 'quarter', label: 'quarter', percent: 25 },
      { key: 'half', label: 'Halfway', percent: 50 },
      { key: 'landing', label: 'Touchdown', percent: 100 },
    ]);
  });

  it('a full policy row keeps streak settings and adds waypoints', () => {
    const p = parseRecognitionPolicy({ ruleVersion: 'recognition-v1', milestones: [3, 7], waypoints: [{ key: 'ignition', label: 'Ignition', percent: 30 }] });
    expect(p.milestones).toEqual([3, 7]);
    expect(p.waypoints).toEqual([{ key: 'ignition', label: 'Ignition', percent: 30 }]);
  });
});

describe('freshCelebrations', () => {
  const now = Date.parse('2026-10-21T06:10:00.000Z');
  const task = (crossings: WaypointCrossing[]) => [{ taskId: 't1', taskTag: 'Oct26_T5', crossings }];

  it('celebrates the viewer\'s own crossings within 15 minutes, furthest first, with the policy label', () => {
    const items = freshCelebrations(task([crossing('ignition', 30), crossing('escape_velocity', 50)]), now);
    expect(items.map((i) => [i.key, i.label, i.taskTag])).toEqual([
      ['escape_velocity', 'Escape Velocity', 'Oct26_T5'],
      ['ignition', 'Ignition', 'Oct26_T5'],
    ]);
  });

  it('skips other people\'s saves, backfilled rows and crossings older than the window', () => {
    expect(freshCelebrations(task([crossing('ignition', 30, { mine: false })]), now)).toEqual([]);
    expect(freshCelebrations(task([crossing('ignition', 30, { source: 'backfill' })]), now)).toEqual([]);
    expect(freshCelebrations(task([crossing('ignition', 30)]), Date.parse('2026-10-21T06:00:00.000Z') + CELEBRATION_WINDOW_MS + 1)).toEqual([]);
    expect(freshCelebrations(task([crossing('ignition', 30, { reachedAt: 'not a date' })]), now)).toEqual([]);
  });

  it('a stamp ahead of a slow device clock is still celebrated', () => {
    expect(freshCelebrations(task([crossing('ignition', 30, { reachedAt: '2026-10-21T06:15:00.000Z' })]), now)).toHaveLength(1);
  });

  it('a crossing inserted with the mission counts like a progress save', () => {
    expect(freshCelebrations(task([crossing('landing', 100, { source: 'insert' })]), now)).toHaveLength(1);
  });
});

describe('missionWaypoints (what the Missions list sends to the browser)', () => {
  const now = Date.parse('2026-10-21T06:10:00.000Z');
  it("keeps reached keys for every mission and only the viewer's own crossings from the last day", () => {
    const payload = missionWaypoints(
      {
        waypoints: DEFAULT_WAYPOINTS,
        crossings: {
          a: [crossing('ignition', 30, { source: 'backfill', mine: false }), crossing('escape_velocity', 50)],
          b: [crossing('ignition', 30, { mine: false })],
          c: [crossing('ignition', 30, { reachedAt: '2026-10-19T06:00:00.000Z' })],
        },
      },
      [{ id: 'a', taskTag: 'A' }, { id: 'b', taskTag: 'B' }, { id: 'c', taskTag: 'C' }, { id: 'd', taskTag: 'D' }],
      now,
    );
    expect(payload.reached).toEqual({ a: ['ignition', 'escape_velocity'], b: ['ignition'], c: ['ignition'] });
    expect(payload.recent.map((r) => [r.taskTag, r.crossings.map((c) => c.key)])).toEqual([['A', ['escape_velocity']]]);
  });
});
