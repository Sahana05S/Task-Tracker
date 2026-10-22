import { describe, expect, it } from 'vitest';
import { DEFAULT_RECOGNITION_POLICY, pointsFor, rankHall, tierFor, TIERS } from '@/modules/recognition/client';

const points = DEFAULT_RECOGNITION_POLICY.points;
const member = (userId: string, name: string, dailyStars: number, categoryAwards: number, monthlyStars: number) =>
  ({ userId, name, dailyStars, categoryAwards, monthlyStars, categories: {} });

describe('pointsFor (approved 10 / 25 / 100)', () => {
  it('adds daily stars, category awards and monthly stars at their weights', () => {
    expect(pointsFor({ dailyStars: 3, categoryAwards: 2, monthlyStars: 1 }, points)).toBe(30 + 50 + 100);
  });

  it('makes one monthly star worth more than three category awards', () => {
    expect(pointsFor({ dailyStars: 0, categoryAwards: 0, monthlyStars: 1 }, points))
      .toBeGreaterThan(pointsFor({ dailyStars: 0, categoryAwards: 3, monthlyStars: 0 }, points));
  });

  it('is zero with no trophies', () => {
    expect(pointsFor({ dailyStars: 0, categoryAwards: 0, monthlyStars: 0 }, points)).toBe(0);
  });
});

describe('tierFor (Rookie 0, Bronze 25, Silver 100, Gold 300, Diamond 750)', () => {
  it('starts everyone as a Rookie', () => {
    expect(tierFor(0)).toMatchObject({ tier: { key: 'rookie' }, next: { key: 'bronze' }, toNext: 25, percent: 0 });
  });

  it('moves up exactly at each threshold', () => {
    expect(TIERS.map((t) => tierFor(t.from).tier.key)).toEqual(['rookie', 'bronze', 'silver', 'gold', 'diamond']);
    expect(tierFor(99).tier.key).toBe('bronze');
  });

  it('reports progress within the tier', () => {
    expect(tierFor(200)).toMatchObject({ tier: { key: 'silver' }, next: { key: 'gold' }, toNext: 100, percent: 50 });
  });

  it('stops at Diamond', () => {
    expect(tierFor(5000)).toMatchObject({ tier: { key: 'diamond' }, next: null, toNext: 0, percent: 100 });
  });
});

describe('rankHall (everyone by points)', () => {
  it('ranks by points, sharing a place on equal points (1, 1, 3)', () => {
    const hall = rankHall([member('a', 'Asha', 1, 0, 0), member('b', 'Bala', 0, 0, 1), member('c', 'Chitra', 10, 0, 0)], points);
    expect(hall.map((e) => [e.userId, e.points, e.rank])).toEqual([['b', 100, 1], ['c', 100, 1], ['a', 10, 3]]);
    expect(hall[0].tier.key).toBe('silver');
  });

  it('keeps members with no trophies at the bottom as Rookies', () => {
    const hall = rankHall([member('z', 'Zara', 0, 0, 0), member('y', 'Yash', 0, 1, 0)], points);
    expect(hall.map((e) => [e.userId, e.rank, e.tier.key])).toEqual([['y', 1, 'bronze'], ['z', 2, 'rookie']]);
  });

  it('adds policy commendation points to the total and the tier', () => {
    const hall = rankHall([member('a', 'Asha', 1, 0, 0), member('z', 'Zara', 0, 0, 0)], points, { z: { points: 20, commendations: 1 } });
    expect(hall.map((e) => [e.userId, e.points, e.policyPoints, e.commendations, e.rank])).toEqual([['z', 20, 20, 1, 1], ['a', 10, 0, 0, 2]]);
    expect(hall[0].tier.key).toBe('rookie');
    expect(rankHall([member('a', 'Asha', 0, 1, 0)], points, { a: { points: 75, commendations: 3 } })[0].tier.key).toBe('silver');
  });
});
