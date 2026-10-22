import { codeLabel, codeMeaning } from '@/shared/tracker/labels';

/**
 * Plain wording for calculation/award reason codes on everyday surfaces: the
 * glossary label (shared/tracker/labels), except where a whole month reads
 * differently from one day. Codes stay unchanged in data and exports. Unknown
 * codes are never hidden: they fall back to a generic "required data" sentence.
 */
const MONTH_LEVEL: Record<string, string> = {
  attendance_missing: 'Attendance not recorded for some days',
  attendance_denominator_missing: 'Attendance not recorded for some days',
};

/** Strip a "factor:" prefix such as "productivity:raw_input_unavailable". */
function base(code: string): string {
  const index = code.indexOf(':');
  return index >= 0 ? code.slice(index + 1) : code;
}

export function plainReason(code: string): string {
  const key = base(code);
  return MONTH_LEVEL[key] ?? (codeMeaning(key) ? codeLabel(key) : 'Required data not available');
}

export type DataGap = 'attendance' | 'sales' | 'other';

/** The distinct kinds of missing data behind a set of reason codes, in a fixed order. */
export function dataGaps(codes: Iterable<string>): DataGap[] {
  const found = new Set<DataGap>();
  for (const code of codes) {
    const key = base(code);
    if (key.startsWith('attendance')) found.add('attendance');
    else if (key.startsWith('sales')) found.add('sales');
    else if (!['shared_calculation_incomplete', 'required_inputs_unavailable', 'raw_input_unavailable',
      'member_excluded_from_factor_cohort', 'factor_median_unavailable', 'daily_coverage_incomplete',
      'shared_monthly_context_unavailable'].includes(key)) found.add('other');
  }
  return (['attendance', 'sales', 'other'] as const).filter(gap => found.has(gap));
}

export const GAP_SENTENCE: Record<DataGap, string> = {
  attendance: "Attendance hasn't been recorded for every working day.",
  sales: 'Some sales entries need review before they can count.',
  other: 'Some other required inputs are not available yet.',
};

interface ReasonSource {
  reasons: readonly string[];
  members?: readonly { reasons: readonly string[]; factors: Record<string, { reasons: readonly string[] }> }[];
}

/** Every reason code in a calculation result (top level, members and factors). */
export function calculationReasons(calculation: ReasonSource | null | undefined): string[] {
  if (!calculation) return [];
  const codes = [...calculation.reasons];
  for (const member of calculation.members ?? []) {
    codes.push(...member.reasons);
    for (const factor of Object.values(member.factors)) codes.push(...factor.reasons);
  }
  return codes;
}
