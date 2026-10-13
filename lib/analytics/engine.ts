import type { CalculationContext,CalculationResult,MemberCalculation } from '@/lib/performance/engine';
import { Exact } from '@/lib/performance/exact';
import { eligibilityReasons, FRESHNESS_SCORES } from '@/lib/tasks/contract';
import { UnmeasuredProgressError } from '@/lib/analytics/availability';
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

/** Operational analytics compatibility facade. All performance scores/raw factor
 * results come from lib/performance; no local composite formula or award selection.
 * Existing counts/charts remain operational observations, not an alternate engine.
 */

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
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit'}).formatToParts(now);
  return resolvePeriod(Number(parts.find(p=>p.type==='year')!.value),Number(parts.find(p=>p.type==='month')!.value));
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

  return (lower + upper) / 2;
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
export function isTaskEligible(task: Task): boolean { return eligibilityReasons(task).length === 0; }

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
  /** Shared-engine period credit; null when the requested input is unknown. */
  scaledProgress: number|null;
  /** P_i, or `null` when no eligible hours were logged and the rate is undefined. */
  productivity: number | null;
  /** P_i − Median(P). */
  productivityDiff: number | null;

  /** Σ task scale carried in the period. */
  taskScale: number;
  /** Share of total team scale, as a percentage. */
  allocationPercent: number|null;
  /** Allocation % − Median(Allocation %). */
  loadingDiff: number | null;

  /** Sum of known eligible task priority weights; shared attribution is unavailable. */
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
  starScore: number | null;
  calculation?: MemberCalculation;
  calculationContext?:CalculationContext;
  performanceUnavailableReason?: string;
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
  scaledProgress: number|null;
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
  calculation?: CalculationResult;
  members: MemberPerformance[];
  medians: TeamMedians;
  totals: TeamTotals;
  /** Highest composite score among contributing members, if any. */
  starPerformer: MemberPerformance | null;
}

export interface AnalyticsInput {
  calculation?: CalculationResult;
  members: readonly User[];
  tasks: readonly Task[];
  logs: readonly (Pick<DailyTaskLog, "userId" | "taskId" | "logDate" | "hoursWorked" | "progressDelta"> & Pick<DailyTaskLog, "creditShares" | "creditScale" | "effectUnknown">)[];
  attendanceRecords?: readonly AttendanceRecord[];
  attendanceSummaries?: ReadonlyMap<string, AttendanceSummary>;
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
  freshnessSum: number;
  unsettledAttribution: boolean;
  freshnessUnavailable: boolean;
}

export function computeTeamAnalytics(input: AnalyticsInput): TeamAnalytics {
  const { period } = input;
  if (!input.calculation && input.logs.some(log=>log.effectUnknown)) throw new UnmeasuredProgressError();

  // Shared calculation membership reflects active status at the requested as-of.
  const activeMembers = input.members.filter((member) => input.calculation ? input.calculation.members.some(observed=>observed.userId===member.id) : member.isActive);

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
      freshnessSum: 0,
      unsettledAttribution: false,
      freshnessUnavailable: false,
    });
  }

  /* --- Workload: assigned scale, criticality, freshness ------------------ */

  let eligibleTaskCount = 0;
  let rottenTaskCount = 0;

  for (const task of input.tasks) {
    if (!isTaskEligible(task)) continue;
    if (!isTaskCarriedInPeriod(task, period)) continue;

    // Additive shares do not disappear when a different primary is inactive.
    // Preserve the existing active-member cohort without renormalizing shares.
    if (task.participantCreditMode === 'configured' && task.participantShares) {
      for (const [id, units] of Object.entries(task.participantShares)) {
        const recipient = accumulators.get(id);
        if (recipient) recipient.taskScale += (task.taskScale ?? 0) * units / 1_000_000;
      }
    }
    const ids=task.participantCreditMode==='configured' && task.participantShares ? Object.keys(task.participantShares) : [...new Set(task.assigneeIds.length ? task.assigneeIds : [task.assigneeId])];
    const recipients=ids.map(id=>accumulators.get(id)).filter((item):item is Accumulator=>item!==undefined);
    if (!recipients.length) continue;
    eligibleTaskCount++;
    if(task.freshness==='Rotten') rottenTaskCount++;
    if(task.participantCreditMode!=='configured') { const primary=accumulators.get(task.assigneeId); if(primary) primary.taskScale+=task.taskScale ?? 0; }
    for(const accumulator of recipients) {
      accumulator.taskCount++; // operational assigned-task count, not shared completion credit
      if(ids.length>1) accumulator.unsettledAttribution=true;
      if(ids.length===1) accumulator.weightSum+=PRIORITY_WEIGHTS[task.priority];
      if(task.freshness===null) { accumulator.freshnessUnavailable=true; continue; }
      if(ids.length===1) accumulator.freshnessSum+=FRESHNESS_SCORES[task.freshness];
      switch(task.freshness) {
        case 'Super Fresh': case 'Fresh': case 'Almost Fresh': accumulator.freshCount++;break;
        case 'Almost Stale': case 'Stale': accumulator.staleCount++;break;
        case 'Rotten': accumulator.rottenCount++;break;
      }
    }

  }

  /* --- Effort: hours and the progress they produced ---------------------- */

  for (const log of input.logs) {
    if (!isWithinPeriod(log.logDate, period)) continue;

    const accumulator = accumulators.get(log.userId);
    if (!accumulator && !log.creditShares) continue;

    if (accumulator) accumulator.hoursLogged += log.hoursWorked;

    const task = taskById.get(log.taskId);
    if (!task || !isTaskEligible(task)) continue;

    // Hours on ineligible work are recorded but kept out of the productivity
    // denominator. `domain-rules.md` excludes off-hours and zero-scale entries
    // from median calculations, and that has to cover the hours as well as the
    // progress: counting OT time against a rate it can never contribute to would
    // penalise a member for logging it honestly.
    if (accumulator) accumulator.eligibleHours += log.hoursWorked;

    // Execution aggregates carry the scale/shares captured when credit was
    // earned. Legacy input fallback is retained only for old pure fixtures.
    const credit = (log.creditScale ?? task.taskScale ?? 0) * ((log.progressDelta ?? 0) / 100);
    const shares = log.creditShares ?? task.participantShares;
    if (shares) {
      for (const [id, units] of Object.entries(shares)) {
        const recipient = accumulators.get(id);
        if (recipient) recipient.scaledProgress += credit * units / 1_000_000;
      }
    } else if (accumulator) accumulator.scaledProgress += credit;
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
      const eligibleHours = accumulator.eligibleHours;
      const scaledProgress = roundToNumericScale(accumulator.scaledProgress);
      const taskScale = roundToNumericScale(accumulator.taskScale);

      return {
        accumulator,
        hoursLogged,
        eligibleHours,
        scaledProgress,
        // Undefined rather than zero when no eligible hours were logged, matching
        // the treatment of task_productivity.
        productivity: null,
        taskScale,
        allocationPercent:
          totalTaskScale > 0
            ? roundToNumericScale((taskScale / totalTaskScale) * 100)
            : 0,
        criticalityScore:
          accumulator.taskCount > 0 && !accumulator.unsettledAttribution
            ? accumulator.weightSum
            : null,
        freshnessScore: accumulator.taskCount>0 && !accumulator.unsettledAttribution && !accumulator.freshnessUnavailable ? accumulator.freshnessSum : null,
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
    criticalityScore: [...accumulators.values()].some(a=>a.unsettledAttribution) ? null : median(
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

    const calculation=input.calculation?.members.find(member=>member.userId===accumulator.member.id);
    // Retained shape for old operational fixtures; no competing score arithmetic.
    const breakdown={productivityDiff:0,scaledProgress:0,freshnessScore:0,rottenPenalty:0};

    return {
      userId: accumulator.member.id,
      fullName: accumulator.member.fullName,
      employeeId: accumulator.member.employeeId,
      role: accumulator.member.role,

      hoursLogged: primary.hoursLogged,
      eligibleHours: primary.eligibleHours,
      scaledProgress: calculation ? calculation.factors.progress.rawValue : primary.scaledProgress,
      productivity: calculation?.factors.productivity.rawValue ?? null,
      productivityDiff: calculation?.factors.productivity.delta ?? null,

      taskScale: primary.taskScale,
      allocationPercent: calculation ? (calculation.factors.loading.rawValue===null?null:calculation.factors.loading.rawValue*100) : primary.allocationPercent,
      loadingDiff: calculation?.factors.loading.delta ?? null,

      criticalityScore: calculation ? calculation.factors.criticality.rawValue : primary.criticalityScore,
      criticalityDiff: calculation?.factors.criticality.delta ?? null,

      freshnessScore: calculation ? calculation.factors.freshness.rawValue : primary.freshnessScore,
      freshCount: accumulator.freshCount,
      staleCount: accumulator.staleCount,
      rottenCount: accumulator.rottenCount,
      taskCount: accumulator.taskCount,

      calculation,
      calculationContext:input.calculation?.context,
      performanceUnavailableReason: calculation?.status==='complete' ? undefined : 'Ten-factor performance is incomplete. See the shared factor inputs and reasons; no final ranking or award is certified.',
      starScore: calculation?.composite ?? null,
      starBreakdown: breakdown,
      isStarPerformer: false,
      attendance: input.attendanceSummaries?.get(accumulator.member.id) ?? summarizeAttendance(
        attendanceByUser.get(accumulator.member.id) ?? [],
      ),
    };
  });

  // M08 owns award selection. An incomplete result cannot produce a winner.
  const candidates=scored.filter(member=>member.hoursLogged>0);
  const starPerformer=null;

  /* --- Ordering and spread ---------------------------------------------- */

  // Highest composite first, so the dashboard reads as a ranking.
  scored.sort((a,b)=>a.fullName.localeCompare(b.fullName));

  const allocations = scored.map((member) => member.allocationPercent).filter((v):v is number=>v!==null);
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
    calculation: input.calculation,
    members: scored,
    medians: input.calculation ? {productivity:input.calculation.members[0]?.factors.productivity.median ?? null,allocationPercent:input.calculation.members[0]?.factors.loading.median === null || !input.calculation.members.length ? null : input.calculation.members[0].factors.loading.median! * 100,criticalityScore:input.calculation.members[0]?.factors.criticality.median ?? null} : {productivity:null,allocationPercent:null,criticalityScore:null},
    totals: {
      hoursLogged: totalHours,
      eligibleHours: totalEligibleHours,
      scaledProgress: input.calculation ? (input.calculation.members.every(m=>m.factors.progress.rawExact!==null)?input.calculation.members.reduce((s,m)=>s.add(Exact.from(m.factors.progress.rawExact!)),Exact.from(0)).number():null) : totalScaledProgress,
      taskScale: totalTaskScale,
      averageProductivity: null, // No unapproved team productivity aggregation.
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
