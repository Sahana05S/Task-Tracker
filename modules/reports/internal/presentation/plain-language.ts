/**
 * Plain wording for calculation/award reason codes on everyday surfaces.
 * Codes stay unchanged in data, exports and the dashboard's details disclosure;
 * this only decides what a person reads first. Unknown codes are never hidden:
 * they fall back to a generic "required data" sentence.
 */
const PLAIN: Record<string, string> = {
  attendance_unavailable: 'Attendance not recorded for some days',
  attendance_missing: 'Attendance not recorded for some days',
  attendance_denominator_missing: 'Attendance not recorded for some days',
  // Kept for runs and archives calculated before migration 46 mapped sales (D05).
  sales_field_mapping_missing: "Sales weren't connected when this was calculated",
  sales_flags_missing: 'A sales entry is missing its project flags',
  legacy_population_or_validation_provenance_missing: 'Older entries need review before they count',
  history_before_input_baseline: 'Records from before tracking began are not available',
  raw_input_unavailable: 'Required input not available',
  member_excluded_from_factor_cohort: 'Not included in the team comparison',
  factor_median_unavailable: "Team median can't be calculated yet",
  team_assigned_scale_zero: 'No measured workload assigned',
  shared_calculation_incomplete: 'Waiting for required data',
  required_inputs_unavailable: 'Waiting for required data',
  daily_coverage_incomplete: 'Not every day has a decided daily star',
  shared_monthly_context_unavailable: 'Monthly award is waiting for the current calculation',
  award_cutoff_not_reached: "Today's award isn't due yet",
  award_policy_unapproved: 'Award rules are not approved yet',
};

/** Strip a "factor:" prefix such as "productivity:raw_input_unavailable". */
function base(code: string): string {
  const index = code.indexOf(':');
  return index >= 0 ? code.slice(index + 1) : code;
}

export function plainReason(code: string): string {
  return PLAIN[base(code)] ?? 'Required data not available';
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
