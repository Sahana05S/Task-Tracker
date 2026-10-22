// PRIVATE pure rules of the hall of fame: recognition points and tiers.
// Points are a separate currency (DECISIONS "M16 recognition", item 3): daily
// star 10, category award 25, monthly star 100. They never feed a score.
import type { Factor } from '@/modules/scoring/client';

import { rankExact } from './leaderboard-rules';
import type { RecognitionPolicy } from './policy';

export interface TrophyCounts {
  dailyStars: number;
  categoryAwards: number;
  monthlyStars: number;
  /** Category awards per factor. */
  categories: Partial<Record<Factor, number>>;
}

/** One member's trophies as `recognition_points` returns them. */
export type MemberTrophies = TrophyCounts & { userId: string; name: string };

/** One dated trophy of the viewer. */
export interface TrophyEvent {
  kind: 'dailyStar' | 'categoryAward' | 'monthlyStar';
  date: string;
  category: Factor | null;
}

export type TierKey = 'rookie' | 'bronze' | 'silver' | 'gold' | 'diamond';

export interface Tier {
  key: TierKey;
  label: string;
  /** Points needed to reach this tier. */
  from: number;
}

/** Badge tiers from the approved plan (19 October 2026). */
export const TIERS: readonly Tier[] = [
  { key: 'rookie', label: 'Rookie', from: 0 },
  { key: 'bronze', label: 'Bronze', from: 25 },
  { key: 'silver', label: 'Silver', from: 100 },
  { key: 'gold', label: 'Gold', from: 300 },
  { key: 'diamond', label: 'Diamond', from: 750 },
];

export function pointsFor(counts: Pick<TrophyCounts, 'dailyStars' | 'categoryAwards' | 'monthlyStars'>, points: RecognitionPolicy['points']): number {
  return counts.dailyStars * points.dailyStar + counts.categoryAwards * points.categoryAward + counts.monthlyStars * points.monthlyStar;
}

export interface TierProgress {
  tier: Tier;
  next: Tier | null;
  /** Points still needed for the next tier (0 at the top). */
  toNext: number;
  /** Progress through the current tier, 0-100. */
  percent: number;
}

export function tierFor(points: number): TierProgress {
  const index = TIERS.reduce((at, t, i) => (points >= t.from ? i : at), 0);
  const tier = TIERS[index];
  const next = TIERS[index + 1] ?? null;
  if (!next) return { tier, next: null, toNext: 0, percent: 100 };
  return { tier, next, toNext: next.from - points, percent: Math.floor(((points - tier.from) / (next.from - tier.from)) * 100) };
}

/** Commendation points and counts per member, from the policies module (passed in by the page). */
export type PolicyPoints = Readonly<Record<string, { points: number; commendations: number }>>;

export interface HallEntry extends TrophyCounts {
  userId: string;
  name: string;
  points: number;
  /** The part of `points` from policy commendations. */
  policyPoints: number;
  commendations: number;
  rank: number;
  tier: Tier;
}

/**
 * Everyone in the company by points, highest first; equal points share a place.
 * Policy commendation points count towards the total and the tier.
 */
export function rankHall(members: readonly MemberTrophies[], points: RecognitionPolicy['points'], policyPoints: PolicyPoints = {}): HallEntry[] {
  // Alphabetical first; the stable ranking sort keeps that order within a shared place.
  const scored = members.map((m) => {
    const fromPolicies = policyPoints[m.userId] ?? { points: 0, commendations: 0 };
    return { ...m, points: pointsFor(m, points) + fromPolicies.points, policyPoints: fromPolicies.points, commendations: fromPolicies.commendations };
  }).sort((a, b) => a.name.localeCompare(b.name));
  return rankExact(scored, (m) => ({ numerator: String(m.points), denominator: '1' }))
    .map(({ item, rank }) => ({ ...item, rank, tier: tierFor(item.points).tier }));
}

export interface HallOfFameModel {
  policy: RecognitionPolicy['points'];
  entries: HallEntry[];
  viewer: (HallEntry & { progress: TierProgress }) | null;
  /** The viewer's dated trophies, newest first. */
  recent: TrophyEvent[];
}
