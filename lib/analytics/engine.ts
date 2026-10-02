import { roundToNumericScale } from '@/lib/logs/metrics';
import {
  summarizeAttendance,
  type AttendanceSummary,
} from '@/lib/attendance/summary';
import { PRIORITY_WEIGHTS } from '@/lib/tracker/enums';
import type {
  AttendanceRecord,
  DailyTaskLog,
  Task,
  User,
  UserRole,
} from '@/types/tracker';

/**
 * Team performance engine.
 *
 * Implements the mathematical models in `domain-rules.md`:
 *
 *   P_i                = Σ Scaled Progress_i / Σ Hours Logged_i
 *   Productivity Diff  = P_i − Median(P)
 *   Allocation %_i     = (Σ Task Scale_i / Σ Team Task Scale) × 100
 *   Loading Diff       = Allocation %_i − Median(Allocation %)
 *   Criticality_i      = mean priority weight of assigned tasks
 *   Criticality Diff   = Criticality_i − Median(Criticality)
 *   S_i                = 0.4·ProdDiff + 0.3·Progress + 0.2·Freshness − 0.1·Rotten
 *
 * Pure and side-effect free: no React, no Supabase. Everything it needs arrives
 * as arguments so the same code serves the dashboard, the snapshot action, and
 * the tests.
 *
 * ---------------------------------------------------------------------------
 * INTERPRETATIONS
 *
 * `domain-rules.md` leaves three things undefined. Each choice is recorded at
 * the point it is applied, and summarised here.
 *
 * 1. Period scoping of the productivity numerator. The spec says "Σ Scaled
 *    Progress" but `tasks.scaled_progress` is cumulative for the life of the
 *    task, while hours are scoped to the month. Dividing a lifetime numerator by
 *    a monthly denominator is not a rate. So monthly scaled progress is derived
 *    from the logs instead: Σ (task scale × progress delta / 100) over the
 *    period. Numerator and denominator then cover the same window.
 *
 * 2. Freshness Score is named in the star formula and has a column in
 *    `monthly_performance_snapshots`, but is never defined. Implemented as a
 *    weighted share of a member's carried tasks: Fresh 1.0, Stale 0.5,
 *    Rotten 0.0, giving a 0–1 figure that rises as a portfolio stays current.
 *
 * 3. "Active tracking period" membership of tasks. A task counts toward a
 *    member's workload for a month if it was assigned on or before the month
 *    ended and had not already been completed before the month began.
 * ---------------------------------------------------------------------------
 */

/* -------------------------------------------------------------------------- */
/* Star performer weights                                                     */
/* -------------------------------------------------------------------------- */

/** Composite score weights, from `domain-rules.md`. */
export const STAR_WEIGHTS = {
  productivityDiff: 0.4,
  scaledProgress: 0.3,
  freshnessScore: 0.2,
  rottenCount: 0.1,
} as const;

/** Freshness contribution per state, for the freshness score. */
const FRESHNESS_VALUE = {
  Fresh: 1,
  Stale: 0.5,
  Rotten: 0,
} as const;

/* -------------------------------------------------------------------------- */
/* Period                                                                     */
/* -------------------------------------------------------------------------- */

export interface AnalyticsPeriod {
  /** Four-digit year. */
  year: number;
  /** Calendar month, 1–12. */
  month: number;
  /** First day of the month, ISO `YYYY-MM-DD`, inclusive. */
  startDate: string;
  /** Last day of the month, ISO `YYYY-MM-DD`, inclusive. */
  endDate: string;
  /** Human label, e.g. `"September 2026"`. */
  label: string;
}

/** Builds the inclusive date range for a calendar month. */
export function resolvePeriod(year: number, month: number): AnalyticsPeriod {
  const padded = String(month).padStart(2, '0');
  // Day 0 of the next month is the last day of this one, which sidesteps
  // month-length and leap-year special cases.
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  return {
    year,
    month,
    startDate: `${year}-${padded}-01`,
    endDate: `${year}-${padded}-${String(lastDay).padStart(2, '0')}`,
    label: new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
  };
}

/** The calendar month containing `now`. */
export function currentPeriod(now: Date = new Date()): AnalyticsPeriod {
  return resolvePeriod(now.getUTCFullYear(), now.getUTCMonth() + 1);
}

function isWithinPeriod(isoDate: string, period: AnalyticsPeriod): boolean {
  return isoDate >= period.startDate && isoDate <= period.endDate;
}

/* -------------------------------------------------------------------------- */
/* Median                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Median of a sample, or `null` when the sample is empty.
 *
 * Even-sized samples return the mean of the two central values. `null` rather
 * than 0 for an empty sample: "no data" is not "zero", and a zero median would
 * make every differential look like a surplus.
 */
export function median(values: readonly number[]): number | null {
  const usable = values.filter((value) => Number.isFinite(value));
  if (usable.length === 0) return null;

  const sorted = [...usable].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[middle] ?? null;
  }

  const lower = sorted[middle - 1];
  const upper = sorted[middle];
  if (lower === undefined || upper === undefined) return null;

  return roundToNumericScale((lower + upper) / 2);
}

/* -------------------------------------------------------------------------- */
/* Eligibility                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Whether a task may contribute to team statistics.
 *
 * Applies the integrity rules from `domain-rules.md`: off-hours entries and
 * zero-scale administrative rows are excluded, as are discarded tasks, which the
 * spec says are cancelled "without impact on completion score".
 *
 * The stored `valid_for_metrics` flag is deliberately not consulted. It also
 * depends on hours logged, which is a moving target, and a stale flag would
 * quietly distort the medians. Eligibility is recomputed from the task itself.
 */
export function isTaskEligible(task: Task): boolean {
  if (task.category === 'OT') return false;
  if (task.status === 'Discarded') return false;
  if (task.taskScale === null || task.taskScale <= 0) return false;
  return true;
}

/**
 * Whether an eligible task counted toward a member's workload during a period.
 *
 * Assigned on or before the period ended, and not already finished before it
 * began. A task started in August and completed in October is carried by
 * September, which is what "workload during the month" means.
 */
export function isTaskCarriedInPeriod(
  task: Task,
  period: AnalyticsPeriod,
): boolean {
  if (task.assignedDate > period.endDate) return false;
  if (task.completedDate !== null && task.completedDate < period.startDate) {
    return false;
  }
  return true;
}

/* -------------------------------------------------------------------------- */
/* Results                                                                    */
/* -------------------------------------------------------------------------- */

export interface MemberPerformance {
  userId: string;
  fullName: string;
  employeeId: string;
  role: UserRole;

  /** Every hour logged inside the period, whatever it was spent on. */
  hoursLogged: number;
  /**
   * Hours against metric-eligible tasks. This is the productivity denominator;
   * `hoursLogged` is the honest total and may be larger.
   */
  eligibleHours: number;
  /** Scaled progress produced inside the period. */
  scaledProgress: number;
  /** P_i, or `null` when no eligible hours were logged and the rate is undefined. */
  productivity: number | null;
  /** P_i − Median(P). */
  productivityDiff: number | null;

  /** Σ task scale carried in the period. */
  taskScale: number;
  /** Share of total team scale, as a percentage. */
  allocationPercent: number;
  /** Allocation % − Median(Allocation %). */
  loadingDiff: number | null;

  /** Mean priority weight of carried tasks. */
  criticalityScore: number | null;
  /** Criticality − Median(Criticality). */
  criticalityDiff: number | null;

  /** Weighted 0–1 share of carried tasks that are current. */
  freshnessScore: number | null;
  freshCount: number;
  staleCount: number;
  rottenCount: number;
  /** Number of eligible tasks carried in the period. */
  taskCount: number;

  /** Composite star score S_i. */
  starScore: number;
  /** Contribution of each term, so the composite can be read rather than trusted. */
  starBreakdown: {
    productivityDiff: number;
    scaledProgress: number;
    freshnessScore: number;
    rottenPenalty: number;
  };
  /** Whether this member holds the top composite score. */
  isStarPerformer: boolean;
  attendance: AttendanceSummary;
}

export interface TeamMedians {
  productivity: number | null;
  allocationPercent: number | null;
  criticalityScore: number | null;
}

export interface TeamTotals {
  /** Every hour logged in the period. */
  hoursLogged: number;
  /** Hours against metric-eligible tasks only. */
  eligibleHours: number;
  scaledProgress: number;
  taskScale: number;
  /** Team-wide rate: total scaled progress over total eligible hours. */
  averageProductivity: number | null;
  /** Spread between the most and least loaded member, in percentage points. */
  allocationSpread: number;
  activeMemberCount: number;
  /** Members who logged at least one hour in the period. */
  contributingMemberCount: number;
  eligibleTaskCount: number;
  rottenTaskCount: number;
  attendanceHours: number;
  offHours: number;
  payableDays: number;
  absentDays: number;
  leaveDays: number;
}

export interface TeamAnalytics {
  period: AnalyticsPeriod;
  members: MemberPerformance[];
  medians: TeamMedians;
  totals: TeamTotals;
  /** Highest composite score among contributing members, if any. */
  starPerformer: MemberPerformance | null;
}

export interface AnalyticsInput {
  members: readonly User[];
  tasks: readonly Task[];
  logs: readonly DailyTaskLog[];
  attendanceRecords?: readonly AttendanceRecord[];
  period: AnalyticsPeriod;
}

/* -------------------------------------------------------------------------- */
/* Engine                                                                     */
/* -------------------------------------------------------------------------- */

interface Accumulator {
  member: User;
  /** Every hour logged in the period, whatever it was spent on. */
  hoursLogged: number;
  /** Hours against metric-eligible tasks: the productivity denominator. */
  eligibleHours: number;
  scaledProgress: number;
  taskScale: number;
  weightSum: number;
  taskCount: number;
  freshCount: number;
  staleCount: number;
  rottenCount: number;
}

export function computeTeamAnalytics(input: AnalyticsInput): TeamAnalytics {
  const { period } = input;

  // Evaluations run "across all active members": deactivated accounts neither
  // contribute to nor are ranked against the medians.
  const activeMembers = input.members.filter((member) => member.isActive);

  const taskById = new Map<string, Task>();
  for (const task of input.tasks) taskById.set(task.id, task);

  const attendanceByUser = new Map<string, AttendanceRecord[]>();
  for (const record of input.attendanceRecords ?? []) {
    if (!isWithinPeriod(record.attendanceDate, period)) continue;
    const records = attendanceByUser.get(record.userId) ?? [];
    records.push(record);
    attendanceByUser.set(record.userId, records);
  }

  const accumulators = new Map<string, Accumulator>();
  for (const member of activeMembers) {
    accumulators.set(member.id, {
      member,
      hoursLogged: 0,
      eligibleHours: 0,
      scaledProgress: 0,
      taskScale: 0,
      weightSum: 0,
      taskCount: 0,
      freshCount: 0,
      staleCount: 0,
      rottenCount: 0,
    });
  }

  /* --- Workload: assigned scale, criticality, freshness ------------------ */

  let eligibleTaskCount = 0;
  let rottenTaskCount = 0;

  for (const task of input.tasks) {
    if (!isTaskEligible(task)) continue;
    if (!isTaskCarriedInPeriod(task, period)) continue;

    const accumulator = accumulators.get(task.assigneeId);
    // Tasks held by a deactivated member are skipped entirely, including from the
    // counts. Counting them while excluding their scale from the allocation
    // denominator would make the stats card claim a progress total "across N
    // tasks" for an N that included work nobody active is carrying.
    if (!accumulator) continue;

    eligibleTaskCount++;
    if (task.freshness === 'Rotten') rottenTaskCount++;

    accumulator.taskScale += task.taskScale ?? 0;
    accumulator.weightSum += PRIORITY_WEIGHTS[task.priority];
    accumulator.taskCount++;

    switch (task.freshness) {
      case 'Fresh':
        accumulator.freshCount++;
        break;
      case 'Stale':
        accumulator.staleCount++;
        break;
      case 'Rotten':
        accumulator.rottenCount++;
        break;
    }
  }

  /* --- Effort: hours and the progress they produced ---------------------- */

  for (const log of input.logs) {
    if (!isWithinPeriod(log.logDate, period)) continue;

    const accumulator = accumulators.get(log.userId);
    if (!accumulator) continue;

    accumulator.hoursLogged += log.hoursWorked;

    const task = taskById.get(log.taskId);
    if (!task || !isTaskEligible(task)) continue;

    // Hours on ineligible work are recorded but kept out of the productivity
    // denominator. `domain-rules.md` excludes off-hours and zero-scale entries
    // from median calculations, and that has to cover the hours as well as the
    // progress: counting OT time against a rate it can never contribute to would
    // penalise a member for logging it honestly.
    accumulator.eligibleHours += log.hoursWorked;

    // Monthly scaled progress, per interpretation 1 above. Uses the task's
    // current scale against the historical delta; a task re-weighted mid-month
    // therefore restates its earlier entries at the new weight.
    accumulator.scaledProgress +=
      (task.taskScale ?? 0) * ((log.progressDelta ?? 0) / 100);
  }

  /* --- Totals ------------------------------------------------------------ */

  const totalTaskScale = roundToNumericScale(
    [...accumulators.values()].reduce((sum, a) => sum + a.taskScale, 0),
  );
  const totalHours = roundToNumericScale(
    [...accumulators.values()].reduce((sum, a) => sum + a.hoursLogged, 0),
  );
  const totalEligibleHours = roundToNumericScale(
    [...accumulators.values()].reduce((sum, a) => sum + a.eligibleHours, 0),
  );
  const totalScaledProgress = roundToNumericScale(
    [...accumulators.values()].reduce((sum, a) => sum + a.scaledProgress, 0),
  );

  /* --- Per-member primaries --------------------------------------------- */

  interface Primary {
    accumulator: Accumulator;
    hoursLogged: number;
    eligibleHours: number;
    scaledProgress: number;
    productivity: number | null;
    taskScale: number;
    allocationPercent: number;
    criticalityScore: number | null;
    freshnessScore: number | null;
  }

  const primaries: Primary[] = [...accumulators.values()].map(
    (accumulator) => {
      const hoursLogged = roundToNumericScale(accumulator.hoursLogged);
      const eligibleHours = roundToNumericScale(accumulator.eligibleHours);
      const scaledProgress = roundToNumericScale(accumulator.scaledProgress);
      const taskScale = roundToNumericScale(accumulator.taskScale);

      return {
        accumulator,
        hoursLogged,
        eligibleHours,
        scaledProgress,
        // Undefined rather than zero when no eligible hours were logged, matching
        // the treatment of task_productivity.
        productivity:
          eligibleHours > 0
            ? roundToNumericScale(scaledProgress / eligibleHours)
            : null,
        taskScale,
        allocationPercent:
          totalTaskScale > 0
            ? roundToNumericScale((taskScale / totalTaskScale) * 100)
            : 0,
        criticalityScore:
          accumulator.taskCount > 0
            ? roundToNumericScale(accumulator.weightSum / accumulator.taskCount)
            : null,
        freshnessScore:
          accumulator.taskCount > 0
            ? roundToNumericScale(
                (accumulator.freshCount * FRESHNESS_VALUE.Fresh +
                  accumulator.staleCount * FRESHNESS_VALUE.Stale +
                  accumulator.rottenCount * FRESHNESS_VALUE.Rotten) /
                  accumulator.taskCount,
              )
            : null,
      };
    },
  );

  /* --- Medians ---------------------------------------------------------- */

  // Productivity: only members with logged hours. A member who logged nothing
  // has an undefined rate, and folding them in as 0 would drag the median down
  // with people who simply were not working on tracked tasks.
  const medians: TeamMedians = {
    productivity: median(
      primaries
        .map((p) => p.productivity)
        .filter((value): value is number => value !== null),
    ),
    // Allocation: every active member, including those at 0%. Nobody's share is
    // undefined, and an idle member genuinely carries none of the workload.
    allocationPercent: median(primaries.map((p) => p.allocationPercent)),
    // Criticality: only members holding tasks; the mean of an empty set is
    // undefined, not zero.
    criticalityScore: median(
      primaries
        .map((p) => p.criticalityScore)
        .filter((value): value is number => value !== null),
    ),
  };

  /* --- Differentials and composite score -------------------------------- */

  const scored: MemberPerformance[] = primaries.map((primary) => {
    const { accumulator } = primary;

    const productivityDiff =
      primary.productivity !== null && medians.productivity !== null
        ? roundToNumericScale(primary.productivity - medians.productivity)
        : null;

    const loadingDiff =
      medians.allocationPercent !== null
        ? roundToNumericScale(
            primary.allocationPercent - medians.allocationPercent,
          )
        : null;

    const criticalityDiff =
      primary.criticalityScore !== null && medians.criticalityScore !== null
        ? roundToNumericScale(
            primary.criticalityScore - medians.criticalityScore,
          )
        : null;

    // A null differential contributes nothing rather than penalising: a member
    // with no logged hours should be neither rewarded nor punished by a term
    // that cannot be computed for them.
    const breakdown = {
      productivityDiff: roundToNumericScale(
        STAR_WEIGHTS.productivityDiff * (productivityDiff ?? 0),
      ),
      scaledProgress: roundToNumericScale(
        STAR_WEIGHTS.scaledProgress * primary.scaledProgress,
      ),
      freshnessScore: roundToNumericScale(
        STAR_WEIGHTS.freshnessScore * (primary.freshnessScore ?? 0),
      ),
      rottenPenalty: roundToNumericScale(
        STAR_WEIGHTS.rottenCount * accumulator.rottenCount,
      ),
    };

    return {
      userId: accumulator.member.id,
      fullName: accumulator.member.fullName,
      employeeId: accumulator.member.employeeId,
      role: accumulator.member.role,

      hoursLogged: primary.hoursLogged,
      eligibleHours: primary.eligibleHours,
      scaledProgress: primary.scaledProgress,
      productivity: primary.productivity,
      productivityDiff,

      taskScale: primary.taskScale,
      allocationPercent: primary.allocationPercent,
      loadingDiff,

      criticalityScore: primary.criticalityScore,
      criticalityDiff,

      freshnessScore: primary.freshnessScore,
      freshCount: accumulator.freshCount,
      staleCount: accumulator.staleCount,
      rottenCount: accumulator.rottenCount,
      taskCount: accumulator.taskCount,

      starScore: roundToNumericScale(
        breakdown.productivityDiff +
          breakdown.scaledProgress +
          breakdown.freshnessScore -
          breakdown.rottenPenalty,
      ),
      starBreakdown: breakdown,
      isStarPerformer: false,
      attendance: summarizeAttendance(
        attendanceByUser.get(accumulator.member.id) ?? [],
      ),
    };
  });

  /* --- Star performer --------------------------------------------------- */

  // Only members who actually logged effort are eligible. A member with no
  // recorded hours can still score on freshness alone, and awarding them the
  // month would be indefensible.
  const candidates = scored.filter((member) => member.hoursLogged > 0);

  const starPerformer =
    candidates.length === 0
      ? null
      : candidates.reduce((best, candidate) => {
          if (candidate.starScore !== best.starScore) {
            return candidate.starScore > best.starScore ? candidate : best;
          }
          // Deterministic tie-breaks: more progress first, then name, so the
          // same inputs always crown the same person.
          if (candidate.scaledProgress !== best.scaledProgress) {
            return candidate.scaledProgress > best.scaledProgress
              ? candidate
              : best;
          }
          return candidate.fullName.localeCompare(best.fullName) < 0
            ? candidate
            : best;
        });

  if (starPerformer) {
    starPerformer.isStarPerformer = true;
  }

  /* --- Ordering and spread ---------------------------------------------- */

  // Highest composite first, so the dashboard reads as a ranking.
  scored.sort((a, b) => b.starScore - a.starScore || a.fullName.localeCompare(b.fullName));

  const allocations = scored.map((member) => member.allocationPercent);
  const allocationSpread =
    allocations.length === 0
      ? 0
      : roundToNumericScale(Math.max(...allocations) - Math.min(...allocations));
  const attendanceSummary = summarizeAttendance(
    scored.flatMap((member) =>
      attendanceByUser.get(member.userId) ?? [],
    ),
  );

  return {
    period,
    members: scored,
    medians,
    totals: {
      hoursLogged: totalHours,
      eligibleHours: totalEligibleHours,
      scaledProgress: totalScaledProgress,
      taskScale: totalTaskScale,
      averageProductivity:
        totalEligibleHours > 0
          ? roundToNumericScale(totalScaledProgress / totalEligibleHours)
          : null,
      allocationSpread,
      activeMemberCount: activeMembers.length,
      contributingMemberCount: candidates.length,
      eligibleTaskCount,
      rottenTaskCount,
      attendanceHours: attendanceSummary.attendanceHours,
      offHours: attendanceSummary.offHours,
      payableDays: attendanceSummary.payableDays,
      absentDays: attendanceSummary.absentDays,
      leaveDays: attendanceSummary.leaveDays,
    },
    starPerformer,
  };
}
