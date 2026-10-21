// PRIVATE pure rules for the leaderboard. Ranks the shared engine's own
// results (no new scoring rule): the composite for members the engine marks
// eligible for ranking, and each factor's raw value for members with that
// factor available and no attendance eligibility reasons.
import { FACTOR_UNITS, FACTORS, memberEligibilityReasons, type CalculationResult, type Factor, type MemberCalculation } from '@/modules/scoring/client';
import { displayPerformance, Exact, type ExactValue } from '@/shared/math/exact';

export type BoardKey = 'composite' | Factor;
export const BOARD_KEYS: readonly BoardKey[] = ['composite', ...FACTORS];

export const BOARD_LABELS: Record<BoardKey, string> = {
  composite: 'Overall', productivity: 'Productivity', criticality: 'Criticality', loading: 'Loading', completion: 'Completion',
  progress: 'Progress', sales: 'Sales', facts: 'Facts', ideas: 'Ideas', suggestions: 'Suggestions', freshness: 'Freshness',
};

/** What each board ranks, in plain words. */
export const BOARD_SUMMARIES: Record<BoardKey, string> = {
  composite: 'The ten-factor score: each factor compared with the team median, weighted and added up.',
  productivity: 'Scaled progress earned per attendance hour.',
  criticality: 'The priority weight of the missions carried.',
  loading: 'How much of the team workload is carried (0 to 1).',
  completion: 'Missions completed (a shared mission counts by its share).',
  progress: 'Scaled progress earned on missions.',
  sales: 'Sales entries, new projects and basement payments.',
  facts: 'Daily facts posted and validated.',
  ideas: 'Ideas posted and validated.',
  suggestions: 'Suggestions posted and validated.',
  freshness: 'How fresh completed missions are: early or on time scores higher.',
};

/** `locked` is only the fallback for a database without the sales mapping (migration 46). */
export type BoardStatus = 'ready' | 'locked' | 'unavailable';

export interface BoardRow {
  userId: string;
  /** Competition rank: exact ties share a rank and the next rank skips (1, 1, 3). */
  rank: number;
  /** The ranked value for display, or null when the viewer may not see it. */
  value: string | null;
  /** Difference from the team median (factor boards only), or null when hidden. */
  delta: string | null;
}

export interface Board {
  key: BoardKey;
  status: BoardStatus;
  /** Why the board is locked or unavailable (engine reason codes). */
  reasons: string[];
  /** The unit the values are in. */
  unit: string;
  rows: BoardRow[];
  /** Members not ranked here; reasons only for members the viewer may see. */
  unranked: { userId: string; reasons: string[] }[];
}

export interface LeaderboardModel {
  /** First day of the month, YYYY-MM-DD. */
  month: string;
  asOf: string;
  viewerId: string;
  boards: Record<BoardKey, Board>;
}

export const SALES_MAPPING_MISSING = 'sales_field_mapping_missing';

/** Composite scores show two decimals; factors use the engine's factor display places. */
const COMPOSITE_PLACES = 2;

/** Competition ranking over exact values, highest first. Order of equal values follows input order. */
export function rankExact<T>(items: readonly T[], value: (item: T) => ExactValue): { item: T; rank: number }[] {
  const sorted = items.map((item) => ({ item, exact: Exact.from(value(item)) })).sort((a, b) => b.exact.compare(a.exact));
  return sorted.map((entry, index) => {
    let first = index;
    while (first > 0 && sorted[first - 1].exact.compare(entry.exact) === 0) first -= 1;
    return { item: entry.item, rank: first + 1 };
  });
}

function lockedOrUnavailable(reasons: string[]): BoardStatus {
  return reasons.some((r) => r === SALES_MAPPING_MISSING || r.endsWith(`:${SALES_MAPPING_MISSING}`)) ? 'locked' : 'unavailable';
}

function compositeBoard(members: readonly MemberCalculation[], canSee: (userId: string) => boolean): Board {
  const ranked = members.filter((m) => m.eligibleForRanking && m.compositeExact);
  const rows = rankExact(ranked, (m) => m.compositeExact!).map(({ item, rank }) => ({
    userId: item.userId, rank, value: displayPerformance(item.compositeExact, COMPOSITE_PLACES), delta: null,
  }));
  const unranked = members.filter((m) => !ranked.includes(m)).map((m) => ({ userId: m.userId, reasons: canSee(m.userId) ? m.reasons : [] }));
  const reasons = rows.length ? [] : [...new Set(members.flatMap((m) => m.reasons))];
  return { key: 'composite', status: rows.length ? 'ready' : lockedOrUnavailable(reasons), reasons, unit: 'composite score', rows, unranked };
}

function factorBoard(factor: Factor, members: readonly MemberCalculation[], places: number, canSee: (userId: string) => boolean): Board {
  const ranked = members.filter((m) => m.factors[factor].available && m.factors[factor].rawExact && memberEligibilityReasons(m).length === 0);
  const rows = rankExact(ranked, (m) => m.factors[factor].rawExact!).map(({ item, rank }) => {
    const visible = canSee(item.userId), result = item.factors[factor];
    return {
      userId: item.userId, rank,
      value: visible ? displayPerformance(result.rawExact, places) : null,
      delta: visible ? displayPerformance(result.deltaExact, places) : null,
    };
  });
  const unranked = members.filter((m) => !ranked.includes(m)).map((m) => ({
    userId: m.userId,
    reasons: canSee(m.userId) ? [...memberEligibilityReasons(m), ...m.factors[factor].reasons] : [],
  }));
  const reasons = rows.length ? [] : [...new Set(members.flatMap((m) => m.factors[factor].reasons))];
  return { key: factor, status: rows.length ? 'ready' : lockedOrUnavailable(reasons), reasons, unit: FACTOR_UNITS[factor], rows, unranked };
}

/**
 * Every board for one month from the shared calculation. `canSee(userId)` says
 * whether the viewer may see that member's factor values and reasons (self or
 * a manager); ranks and composite scores are visible to everyone (DECISIONS
 * "M16 recognition", item 2).
 */
export function buildLeaderboard(
  calculation: Pick<CalculationResult, 'context' | 'members'>,
  viewerId: string,
  canSee: (userId: string) => boolean,
): LeaderboardModel {
  const places = calculation.context.factorDisplayPlaces ?? 6;
  const boards = { composite: compositeBoard(calculation.members, canSee) } as Record<BoardKey, Board>;
  for (const factor of FACTORS) boards[factor] = factorBoard(factor, calculation.members, places, canSee);
  return { month: calculation.context.periodStart, asOf: calculation.context.asOf, viewerId, boards };
}

/** Reads `?board=` safely; anything unknown falls back to the composite board. */
export function parseBoardKey(value: string | undefined): BoardKey {
  return (BOARD_KEYS as readonly string[]).includes(value ?? '') ? (value as BoardKey) : 'composite';
}

/** The podium: everyone holding rank 1, 2 or 3 (shared ranks stack on one step). */
export function podiumSteps(rows: readonly BoardRow[]): { rank: number; rows: BoardRow[] }[] {
  return [1, 2, 3]
    .map((rank) => ({ rank, rows: rows.filter((r) => r.rank === rank) }))
    .filter((step) => step.rows.length > 0);
}
