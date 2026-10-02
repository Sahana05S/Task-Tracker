import { roundToNumericScale } from '@/lib/logs/metrics';

export interface DailyStarCandidateInput {
  readonly userId: string;
  readonly fullName: string;
  readonly hoursLogged: number;
  readonly scaledProgress: number;
  readonly checklistCompletionPercentage: number;
  readonly freshnessPercentage: number;
  readonly attendanceValid: boolean;
}

export interface DailyStarCandidateScore extends DailyStarCandidateInput {
  readonly productivity: number;
  readonly productivityComponent: number;
  readonly progressComponent: number;
  readonly checklistComponent: number;
  readonly freshnessComponent: number;
  readonly attendanceComponent: number;
  readonly score: number;
}

export const DAILY_STAR_WEIGHTS = {
  progress: 0.3,
  productivity: 0.25,
  checklist: 0.2,
  freshness: 0.15,
  attendance: 0.1,
} as const;

export function scoreDailyStarCandidate(
  candidate: DailyStarCandidateInput,
): DailyStarCandidateScore {
  const productivity =
    candidate.hoursLogged > 0
      ? roundToNumericScale(candidate.scaledProgress / candidate.hoursLogged)
      : 0;
  const progressComponent = roundToNumericScale(
    DAILY_STAR_WEIGHTS.progress * candidate.scaledProgress,
  );
  const productivityComponent = roundToNumericScale(
    DAILY_STAR_WEIGHTS.productivity * productivity,
  );
  const checklistComponent = roundToNumericScale(
    DAILY_STAR_WEIGHTS.checklist *
      clampPercentage(candidate.checklistCompletionPercentage),
  );
  const freshnessComponent = roundToNumericScale(
    DAILY_STAR_WEIGHTS.freshness * clampPercentage(candidate.freshnessPercentage),
  );
  const attendanceComponent = roundToNumericScale(
    DAILY_STAR_WEIGHTS.attendance * (candidate.attendanceValid ? 100 : 0),
  );

  return {
    ...candidate,
    productivity,
    productivityComponent,
    progressComponent,
    checklistComponent,
    freshnessComponent,
    attendanceComponent,
    score: roundToNumericScale(
      progressComponent +
        productivityComponent +
        checklistComponent +
        freshnessComponent +
        attendanceComponent,
    ),
  };
}

export function selectDailyStarWinner(
  candidates: readonly DailyStarCandidateInput[],
): DailyStarCandidateScore | null {
  const scored = candidates
    .filter((candidate) => candidate.hoursLogged > 0 || candidate.attendanceValid)
    .map(scoreDailyStarCandidate);

  if (scored.length === 0) return null;

  return scored.reduce((best, candidate) => {
    if (candidate.score !== best.score) {
      return candidate.score > best.score ? candidate : best;
    }
    if (candidate.scaledProgress !== best.scaledProgress) {
      return candidate.scaledProgress > best.scaledProgress ? candidate : best;
    }
    if (candidate.hoursLogged !== best.hoursLogged) {
      return candidate.hoursLogged > best.hoursLogged ? candidate : best;
    }
    return candidate.fullName.localeCompare(best.fullName) < 0
      ? candidate
      : best;
  });
}

export function attendanceIsValidForDailyStar(input: {
  readonly status: string;
  readonly attendanceHours: number;
  readonly offHours: number;
}): boolean {
  switch (input.status) {
    case 'Present':
      return input.attendanceHours > 0;
    case 'Half Day':
      return input.attendanceHours > 0;
    case 'Holiday':
      return true;
    case 'Off Hours':
      return input.offHours > 0;
    case 'Absent':
    case 'Leave':
    default:
      return false;
  }
}

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}
