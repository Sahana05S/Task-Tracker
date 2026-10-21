// PRIVATE pure rules of the monthly award ceremony. The same rule runs in
// migration 50 (`recognition_category`, `recognition_monthly_star`) when the
// director publishes; this copy draws the provisional ceremony before then.
// No new scoring rule: winners come from the shared calculation and the M08
// daily award evidence.
import { FACTORS, memberEligibilityReasons, type CalculationResult, type Factor, type MonthlySelection } from '@/modules/scoring/client';
import { Exact, type ExactValue } from '@/shared/math/exact';

export type CategoryStatus = 'awarded' | 'tie' | 'no_eligible' | 'unavailable';

export interface CategoryAward {
  category: Factor;
  /**
   * `awarded`: one member holds the highest raw value. `tie`: an exact tie at
   * the top, so no winner (the M08 rule). `no_eligible`: the factor was
   * measured but no eligible member scored above zero. `unavailable`: no one
   * has the factor this month (`reasons` says why).
   */
  status: CategoryStatus;
  winnerId: string | null;
  tiedIds: string[];
  /** The winning raw value, or null when hidden from the viewer or absent. */
  winningRaw: ExactValue | null;
  reasons: string[];
}

/**
 * One award per factor: the highest raw value among members with the factor
 * available, no attendance eligibility reason and a value above zero.
 */
export function selectCategoryWinners(calculation: Pick<CalculationResult, 'members'>): CategoryAward[] {
  return FACTORS.map((category) => {
    const available = calculation.members.filter((m) => m.factors[category].available && m.factors[category].rawExact);
    if (!available.length) {
      const reasons = [...new Set(calculation.members.flatMap((m) => m.factors[category].reasons))].sort();
      return { category, status: 'unavailable', winnerId: null, tiedIds: [], winningRaw: null, reasons };
    }
    const zero = Exact.from(0);
    const candidates = available
      .filter((m) => memberEligibilityReasons(m).length === 0)
      .map((m) => ({ userId: m.userId, raw: m.factors[category].rawExact!, exact: Exact.from(m.factors[category].rawExact!) }))
      .filter((c) => c.exact.compare(zero) > 0);
    if (!candidates.length) return { category, status: 'no_eligible', winnerId: null, tiedIds: [], winningRaw: null, reasons: [] };
    const best = candidates.reduce((top, c) => (c.exact.compare(top.exact) > 0 ? c : top));
    const top = candidates.filter((c) => c.exact.compare(best.exact) === 0);
    if (top.length > 1) {
      return { category, status: 'tie', winnerId: null, tiedIds: top.map((c) => c.userId).sort(), winningRaw: best.raw, reasons: [] };
    }
    return { category, status: 'awarded', winnerId: best.userId, tiedIds: [], winningRaw: best.raw, reasons: [] };
  });
}

/** The monthly star act, from the M08 monthly selection (live) or the published record. */
export interface MonthlyStarAct {
  /** `winner`: decided. `no_winner`: decided without a star (tie or no daily wins). `pending`: not decided yet. */
  status: 'winner' | 'no_winner' | 'pending';
  winnerId: string | null;
  /** Certified effective daily stars per member this month. */
  counts: Record<string, number>;
  tiedIds: string[];
  reasons: string[];
}

export function monthlyStarAct(selection: Pick<MonthlySelection, 'status' | 'winnerId' | 'counts' | 'tiedIds' | 'reasons'>): MonthlyStarAct {
  const base = { counts: selection.counts ?? {}, tiedIds: selection.tiedIds ?? [], reasons: selection.reasons ?? [] };
  if (selection.winnerId) return { ...base, status: 'winner', winnerId: selection.winnerId };
  return { ...base, status: selection.status === 'complete' ? 'no_winner' : 'pending', winnerId: null };
}

/**
 * Where the ceremony stands. `official`: published (the latest revision).
 * `ready`: the month has ended and a director may publish. `provisional`: the
 * month is still running; results update until it ends.
 */
export type CeremonyStatus = 'official' | 'ready' | 'provisional';

export interface CeremonyModel {
  /** First day of the month, YYYY-MM-DD. */
  month: string;
  status: CeremonyStatus;
  categories: CategoryAward[];
  monthlyStar: MonthlyStarAct;
  /** The published record, when official. */
  publication: { ceremonyId: string; revisionNumber: number; publishedAt: string; reason: string | null } | null;
  /** The as-of instant the results were calculated at. */
  asOf: string;
  /** False when the database lacks the ceremony publication (migration 50): previews still work. */
  publishingAvailable: boolean;
  /** The viewer may publish (or republish) this month now. */
  canPublish: boolean;
  /** The revision a publish must expect (0 before the first). */
  expectedRevision: number;
  /** Display names of the month's members, by user id. */
  names: Record<string, string>;
}

/** Hides winning values except from managers and the winner (as `recognition_ceremony_read` does). */
export function projectCategories(categories: readonly CategoryAward[], viewerId: string, manager: boolean): CategoryAward[] {
  return categories.map((c) => (manager || (c.winnerId !== null && c.winnerId === viewerId) ? c : { ...c, winningRaw: null }));
}
