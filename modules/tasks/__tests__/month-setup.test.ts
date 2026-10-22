import { describe, expect, it } from 'vitest';

import {
  addMonths,
  buildSetupPayload,
  carryoverAvailable,
  defaultPreviousAction,
  defaultSetupMonth,
  defaultStandingSelection,
  isCovered,
  mentionsMonth,
  monthBounds,
  phaseTitle,
  previousRows,
  setupBannerMonth,
  standingKey,
  standingTitle,
  swapMonthInTitle,
  weeklyPhases,
  type PreviousMission,
  type SetupMember,
  type SetupStanding,
} from '@/modules/tasks/internal/tools/month-setup';

const standing = (id: string, titlePattern: string, ownerMode: 'per_member' | 'single' = 'per_member', ownerId: string | null = null): SetupStanding => ({
  id, titlePattern, category: 'T', priority: 'Medium', ownerMode, ownerId, scaleMode: 'hours', sort: 0,
});
const STANDING = [
  standing('off', 'Off Hours - {month} - {member}'),
  standing('nd', 'Non-Documented Tasks - {month} - {member}'),
  standing('tracker', 'Tasks Tracker, Accounts Book and Attendance Sheet - {month}', 'single'),
  standing('hrc', 'HRC Tasks - {month}', 'single', 'u3'),
  standing('db', 'Database Re-Organisation', 'single'),
];
const MEMBERS: SetupMember[] = [
  { id: 'md', name: 'Asha Rao', role: 'managing_director' },
  { id: 'u2', name: 'Bala K', role: 'team_member' },
];
const mission = (over: Partial<PreviousMission>): PreviousMission => ({
  id: 't1', taskTag: 'Oct26_T5', title: 'Site survey', category: 'T', status: 'In Progress', progress: 40,
  assignedDate: '2026-10-01', dueDate: '2026-10-31', assigneeNames: ['Bala K'], runningTimer: false, ...over,
});

describe('month bounds and weekly phases', () => {
  it('knows month lengths, including February in leap and common years', () => {
    expect(monthBounds('2026-02')).toMatchObject({ start: '2026-02-01', end: '2026-02-28', days: 28, label: 'February 2026', name: 'February' });
    expect(monthBounds('2028-02').end).toBe('2028-02-29');
    expect(monthBounds('2026-11').end).toBe('2026-11-30');
    expect(monthBounds('2026-12').end).toBe('2026-12-31');
    expect(() => monthBounds('2026-13')).toThrow();
  });

  it('cuts February 2026 into exactly four full weeks', () => {
    expect(weeklyPhases('2026-02')).toEqual([
      { week: 1, start: '2026-02-01', end: '2026-02-07' },
      { week: 2, start: '2026-02-08', end: '2026-02-14' },
      { week: 3, start: '2026-02-15', end: '2026-02-21' },
      { week: 4, start: '2026-02-22', end: '2026-02-28' },
    ]);
  });

  it('clips the last phase of a leap February, November and December to month end', () => {
    expect(weeklyPhases('2028-02').at(-1)).toEqual({ week: 5, start: '2028-02-29', end: '2028-02-29' });
    const november = weeklyPhases('2026-11');
    expect(november).toHaveLength(5);
    expect(november[3]).toEqual({ week: 4, start: '2026-11-22', end: '2026-11-28' });
    expect(november[4]).toEqual({ week: 5, start: '2026-11-29', end: '2026-11-30' });
    expect(weeklyPhases('2026-12').at(-1)).toEqual({ week: 5, start: '2026-12-29', end: '2026-12-31' });
  });

  it('phases cover every day of the month exactly once', () => {
    for (const key of ['2026-02', '2028-02', '2026-04', '2026-11', '2026-12']) {
      const phases = weeklyPhases(key);
      const days = phases.reduce((sum, phase) => sum + (Date.parse(phase.end) - Date.parse(phase.start)) / 86_400_000 + 1, 0);
      expect(days).toBe(monthBounds(key).days);
      expect(phases[0].start).toBe(monthBounds(key).start);
      expect(phases.at(-1)?.end).toBe(monthBounds(key).end);
    }
  });

  it('rolls months over the year end', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2027-01', -1)).toBe('2026-12');
    expect(phaseTitle('2027-01', 2)).toBe('Tasks Review - January 2027 - Week 2');
  });
});

describe('which month and when', () => {
  it('defaults to next month, or the current month while it has no missions', () => {
    expect(defaultSetupMonth('2026-10-22', true)).toBe('2026-11');
    expect(defaultSetupMonth('2026-10-22', false)).toBe('2026-10');
    expect(defaultSetupMonth('2026-12-28', true)).toBe('2027-01');
  });

  it('shows the banner from the 25th while next month is empty', () => {
    expect(setupBannerMonth('2026-10-24', 0)).toBeNull();
    expect(setupBannerMonth('2026-10-25', 0)).toBe('2026-11');
    expect(setupBannerMonth('2026-12-31', 0)).toBe('2027-01');
    expect(setupBannerMonth('2026-10-28', 3)).toBeNull();
  });

  it('carries over only into the month that has started', () => {
    expect(carryoverAvailable('2026-11', '2026-10-26')).toBe(false);
    expect(carryoverAvailable('2026-11', '2026-11-01')).toBe(true);
  });
});

describe('standing missions', () => {
  it('ticks every active member for per-member missions and the owner or MD for single ones', () => {
    const selected = defaultStandingSelection(STANDING, MEMBERS, 'md');
    expect([...selected].sort()).toEqual([
      standingKey('db', 'md'), standingKey('nd', 'md'), standingKey('nd', 'u2'),
      // hrc's saved owner u3 is not an active member, so the MD gets it.
      standingKey('hrc', 'md'),
      standingKey('off', 'md'), standingKey('off', 'u2'), standingKey('tracker', 'md'),
    ].sort());
  });

  it('renders titles with the month and member', () => {
    expect(standingTitle(STANDING[0], '2026-11', 'Bala K')).toBe('Off Hours - November 2026 - Bala K');
    expect(standingTitle(STANDING[4], '2026-11', 'Asha Rao')).toBe('Database Re-Organisation');
  });
});

describe('last month\'s missions', () => {
  it('detects and swaps month names in titles', () => {
    expect(mentionsMonth('October payroll', '2026-10')).toBe(true);
    expect(mentionsMonth('Octoberfest stall', '2026-10')).toBe(false);
    expect(swapMonthInTitle('GST filing - October 2026', '2026-10', '2026-11')).toBe('GST filing - November 2026');
    expect(swapMonthInTitle('october rent', '2026-10', '2026-11')).toBe('November rent');
    expect(swapMonthInTitle('Close December 2026 books', '2026-12', '2027-01')).toBe('Close January 2027 books');
    expect(swapMonthInTitle('Site survey', '2026-10', '2026-11')).toBe('Site survey');
  });

  it('defaults: Done and Discarded skip, month titles repeat, started work carries over', () => {
    expect(defaultPreviousAction(mission({ status: 'Done', progress: 100, title: 'October payroll' }))).toBe('skip');
    expect(defaultPreviousAction(mission({ status: 'Discarded' }))).toBe('skip');
    expect(defaultPreviousAction(mission({ title: 'October payroll', progress: 50 }))).toBe('repeat');
    expect(defaultPreviousAction(mission({ progress: 40 }))).toBe('carryover');
    expect(defaultPreviousAction(mission({ progress: 0, status: 'Not Started' }))).toBe('skip');
    expect(defaultPreviousAction(mission({ progress: 100, status: 'On-Hold' }))).toBe('skip');
    expect(defaultPreviousAction(mission({ progress: null }))).toBe('skip');
  });

  it('hides missions the standing list and weekly phases already recreate', () => {
    expect(isCovered(mission({ title: 'Off Hours - October 2026 - Bala K' }), STANDING)).toBe(true);
    expect(isCovered(mission({ title: 'HRC Tasks - October 2026' }), STANDING)).toBe(true);
    expect(isCovered(mission({ title: 'Database Re-Organisation' }), STANDING)).toBe(true);
    expect(isCovered(mission({ title: 'Tasks Review - October 2026 - Week 3' }), STANDING)).toBe(true);
    // A standing title from another month is not this month's copy.
    expect(isCovered(mission({ title: 'Off Hours - September 2026 - Bala K' }), STANDING)).toBe(false);
    expect(isCovered(mission({ title: 'Site survey' }), STANDING)).toBe(false);
    // Regex characters in a pattern are literal.
    expect(isCovered(mission({ title: 'Tasks Tracker, Accounts Book and Attendance Sheet - October 2026' }), STANDING)).toBe(true);
  });

  it('lists the rest with their defaults', () => {
    const rows = previousRows([
      mission({ id: 'a', title: 'Off Hours - October 2026 - Bala K' }),
      mission({ id: 'b', title: 'October payroll' }),
      mission({ id: 'c', title: 'Site survey', progress: 40 }),
    ], STANDING);
    expect(rows.map((row) => [row.mission.id, row.defaultAction])).toEqual([['b', 'repeat'], ['c', 'carryover']]);
  });
});

describe('payload', () => {
  const selection = {
    month: '2026-11',
    standing: new Set([standingKey('off', 'u2'), standingKey('db', 'md')]),
    phasesOwnerId: 'md',
    previous: new Map([['b', 'repeat'], ['c', 'carryover'], ['d', 'skip']] as const),
  };

  it('sends ticked cells, the phases owner and the chosen previous actions', () => {
    expect(buildSetupPayload(selection, '2026-11-02')).toEqual({
      month: '2026-11',
      standing: [{ missionId: 'db', memberId: 'md' }, { missionId: 'off', memberId: 'u2' }],
      phases: { ownerId: 'md' },
      previous: [{ taskId: 'b', action: 'repeat' }, { taskId: 'c', action: 'carryover' }],
    });
  });

  it('holds carry-overs back until the month starts and can leave phases out', () => {
    const payload = buildSetupPayload({ ...selection, phasesOwnerId: null }, '2026-10-26');
    expect(payload.phases).toBeNull();
    expect(payload.previous).toEqual([{ taskId: 'b', action: 'repeat' }]);
  });
});
