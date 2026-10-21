// PRIVATE. The recognition policy row, as stored in taskpulse_private.recognition_policy.
import { DEFAULT_MILESTONES, DEFAULT_WAYPOINTS, type Waypoint } from './rules';

export interface RecognitionPolicy {
  ruleVersion: string;
  points: { dailyStar: number; categoryAward: number; monthlyStar: number };
  milestones: readonly number[];
  lookbackDays: number;
  /** Mission waypoints, lowest first (migration 51; the defaults before it). */
  waypoints: readonly Waypoint[];
}

/** Mirrors the row inserted by migration 45. */
export const DEFAULT_RECOGNITION_POLICY: RecognitionPolicy = {
  ruleVersion: 'recognition-v1',
  points: { dailyStar: 10, categoryAward: 25, monthlyStar: 100 },
  milestones: DEFAULT_MILESTONES,
  lookbackDays: 400,
  waypoints: DEFAULT_WAYPOINTS,
};

function positiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback;
}

const WAYPOINT_KEY = /^[a-z][a-z0-9_]{0,39}$/;

/**
 * The stored waypoints, lowest first, with the database's own validity rule
 * (key shape, 0 < percent <= 100) and the first entry per key. A missing or
 * wholly invalid list falls back to the defaults (databases before 51).
 */
export function parseWaypoints(raw: unknown): readonly Waypoint[] {
  if (!Array.isArray(raw)) return DEFAULT_WAYPOINTS;
  const seen = new Set<string>();
  const parsed: Waypoint[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const { key, label, percent } = entry as Record<string, unknown>;
    if (typeof key !== 'string' || !WAYPOINT_KEY.test(key) || seen.has(key)) continue;
    if (typeof percent !== 'number' || !(percent > 0 && percent <= 100)) continue;
    seen.add(key);
    parsed.push({ key, label: typeof label === 'string' && label.trim() ? label.trim() : key, percent });
  }
  return parsed.length ? parsed.sort((a, b) => a.percent - b.percent) : DEFAULT_WAYPOINTS;
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
    waypoints: parseWaypoints(r.waypoints),
  };
}
