import { describe, expect, it } from 'vitest';
import { computeStreak, milestonesReached, parseRecognitionPolicy, DEFAULT_RECOGNITION_POLICY } from '@/modules/recognition/client';

const FROM = '2026-10-01';
const streak = (days: string, opts?: Parameters<typeof computeStreak>[3]) => computeStreak(days, FROM, 'u1', opts);

describe('computeStreak (approved active-day streak, 19 October 2026)', () => {
  it('counts consecutive counted days', () => {
    const s = streak('ccc');
    expect(s.current).toBe(3);
    expect(s.longest).toBe(3);
    expect(s.todayCounted).toBe(true);
    expect(s.lastActiveDate).toBe('2026-10-03');
    expect(s.asOf).toBe('2026-10-03');
  });

  it('skipped days (holiday, leave, off hours, no record) bridge the streak without counting', () => {
    const s = streak('ccsc');
    expect(s.current).toBe(3);
    expect(s.longest).toBe(3);
    expect(streak('cssscss').current).toBe(2);
    expect(streak('csssscc').current).toBe(3);
  });

  it('a break resets the current run but keeps the longest', () => {
    const s = streak('ccbccccc'.slice(0, 5)); // c c b c c
    expect(s.current).toBe(2);
    expect(s.longest).toBe(2);
    expect(streak('cccbcc').longest).toBe(3);
    expect(streak('cccbcc').current).toBe(2);
  });

  it('a trailing skipped day keeps the streak alive', () => {
    const s = streak('cccs');
    expect(s.current).toBe(3);
    expect(s.todayCounted).toBe(false);
    expect(s.recentDays.at(-1)).toEqual({ date: '2026-10-04', state: 'pending' });
  });

  it('the as-of day is pending, not a break, until something is logged', () => {
    const s = streak('cccb');
    expect(s.current).toBe(3);
    expect(s.todayCounted).toBe(false);
    expect(s.brokenOn).toBeNull();
    expect(s.recentDays.at(-1)?.state).toBe('pending');
  });

  it('a break before the as-of day ends the streak and names the day', () => {
    const s = streak('cccbs');
    expect(s.current).toBe(0);
    expect(s.longest).toBe(3);
    expect(s.brokenOn).toBe('2026-10-04');
    expect(s.lastActiveDate).toBe('2026-10-03');
    expect(s.recentDays[3]).toEqual({ date: '2026-10-04', state: 'broken' });
  });

  it('a window with nothing counted is zero without a broken date when nothing ever counted', () => {
    expect(streak('')).toMatchObject({ current: 0, longest: 0, lastActiveDate: null, brokenOn: null, nextMilestone: 3, daysToMilestone: 3 });
    expect(streak('sss')).toMatchObject({ current: 0, longest: 0, lastActiveDate: null });
    expect(streak('bbs')).toMatchObject({ current: 0, brokenOn: '2026-10-02' });
  });

  it('milestones: next, distance and reached', () => {
    expect(streak('ccccccc')).toMatchObject({ reached: [3, 7], nextMilestone: 14, daysToMilestone: 7 });
    const hundred = streak('c'.repeat(100));
    expect(hundred).toMatchObject({ current: 100, nextMilestone: null, daysToMilestone: null });
    expect(hundred.reached).toEqual([3, 7, 14, 30, 60, 100]);
  });

  it('recent days are the last 14, oldest first', () => {
    const s = streak('c'.repeat(20));
    expect(s.recentDays).toHaveLength(14);
    expect(s.recentDays[0].date).toBe('2026-10-07');
    expect(s.recentDays[13].date).toBe('2026-10-20');
    expect(streak('ccc', { recentCount: 2 }).recentDays.map((d) => d.date)).toEqual(['2026-10-02', '2026-10-03']);
  });

  it('refuses unknown day codes and bad dates', () => {
    expect(() => streak('ccx')).toThrow('Unknown day code');
    expect(() => computeStreak('c', 'nope', 'u1')).toThrow('Valid from date');
  });
});

describe('milestonesReached', () => {
  it('reports each milestone once, when it is crossed', () => {
    expect(milestonesReached(2, 3)).toEqual([3]);
    expect(milestonesReached(3, 3)).toEqual([]);
    expect(milestonesReached(6, 14)).toEqual([7, 14]);
    expect(milestonesReached(0, 0)).toEqual([]);
  });
});

describe('parseRecognitionPolicy', () => {
  it('mirrors migration 45 by default and tolerates malformed config', () => {
    expect(parseRecognitionPolicy(null)).toEqual(DEFAULT_RECOGNITION_POLICY);
    expect(parseRecognitionPolicy({ points: { dailyStar: 'x' }, milestones: [5, -1, 2.5, 1] })).toMatchObject({
      points: { dailyStar: 10, categoryAward: 25, monthlyStar: 100 },
      milestones: [1, 5],
    });
    expect(parseRecognitionPolicy({ ruleVersion: 'recognition-v2', lookbackDays: 30 })).toMatchObject({ ruleVersion: 'recognition-v2', lookbackDays: 30 });
  });
});
