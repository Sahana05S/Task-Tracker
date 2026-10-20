// PRIVATE. The recognition policy row, as stored in taskpulse_private.recognition_policy.
import { DEFAULT_MILESTONES } from './rules';

export interface RecognitionPolicy {
  ruleVersion: string;
  points: { dailyStar: number; categoryAward: number; monthlyStar: number };
  milestones: readonly number[];
  lookbackDays: number;
}

/** Mirrors the row inserted by migration 45. */
export const DEFAULT_RECOGNITION_POLICY: RecognitionPolicy = {
  ruleVersion: 'recognition-v1',
  points: { dailyStar: 10, categoryAward: 25, monthlyStar: 100 },
  milestones: DEFAULT_MILESTONES,
  lookbackDays: 400,
};

function positiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

/** Parses the stored policy; anything malformed falls back to the defaults it mirrors. */
export function parseRecognitionPolicy(raw: unknown): RecognitionPolicy {
  const d = DEFAULT_RECOGNITION_POLICY;
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  const points = (r.points && typeof r.points === 'object' ? r.points : {}) as Record<string, unknown>;
  const milestones = Array.isArray(r.milestones) ? r.milestones.filter((m): m is number => typeof m === 'number' && Number.isInteger(m) && m > 0) : [];
  return {
    ruleVersion: typeof r.ruleVersion === 'string' && r.ruleVersion ? r.ruleVersion : d.ruleVersion,
    points: {
      dailyStar: positiveInt(points.dailyStar, d.points.dailyStar),
      categoryAward: positiveInt(points.categoryAward, d.points.categoryAward),
      monthlyStar: positiveInt(points.monthlyStar, d.points.monthlyStar),
    },
    milestones: milestones.length ? [...milestones].sort((a, b) => a - b) : d.milestones,
    lookbackDays: positiveInt(r.lookbackDays, d.lookbackDays),
  };
}
