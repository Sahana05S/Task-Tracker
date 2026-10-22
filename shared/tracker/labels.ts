import type {
  AttendanceStatus,
  ChecklistNodeType,
  MilestoneStatus,
  TaskCategory,
  TaskFreshness,
  TaskPriority,
  TaskStatus,
  UserRole,
} from '@/types/tracker';

/**
 * The glossary: words for every stored code that reaches the interface
 * (states, statuses, reasons) and a one-line meaning for each, plus the
 * meanings of the tracker's enums and the terms a `HelpTip` explains.
 *
 * Known codes get a written label; anything else is made readable instead of
 * shown raw, so a new code never surfaces as `snake_case` on screen. Codes stay
 * unchanged in data and exports; this only decides what a person reads.
 */

export interface CodeMeaning {
  readonly label: string;
  /** One plain sentence: what it means for the person reading it. */
  readonly meaning: string;
}

const m = (label: string, meaning: string): CodeMeaning => ({ label, meaning });

/* -------------------------------------------------------------------------- */
/* Stored codes                                                               */
/* -------------------------------------------------------------------------- */

/** Section, record, review, award and job states. */
const STATES: Record<string, CodeMeaning> = {
  // Checklist sections
  complete: m('Complete', 'Everything that applies here is finished.'),
  incomplete: m('Incomplete', 'Some required parts are not finished or not available yet.'),
  partial: m('In progress', 'Some applicable items are done; others are still open.'),
  not_applicable: m('Not applicable', 'Marked N/A, so it is left out of progress.'),
  uninitialized: m('Not confirmed yet', 'The section has not been set up for this mission yet.'),
  missing: m('Not set up', 'This section does not exist for the mission yet.'),
  invalid: m('Needs attention', 'Something here contradicts itself and needs a manager to fix it.'),
  // Records and reviews
  active: m('Active', 'The current version of this record.'),
  pending: m('Waiting for review', 'Saved and counted at the lower pending rate until someone else reviews it.'),
  validated: m('Validated', 'Reviewed and accepted by someone other than the author.'),
  rejected: m('Rejected', 'Reviewed and not accepted; it earns no credit.'),
  withdrawn: m('Withdrawn', 'Taken back by the author or a manager; kept in history but not counted.'),
  legacy_unvalidated: m('Earlier record, not reviewed', 'Came from the old sheet without a review; it needs reconciling before it counts.'),
  // Awards and calculations
  completed_winner: m('Winner chosen', 'The award was decided and has a winner.'),
  completed_none: m('No winner', 'The award was decided, but nobody qualified or there was an exact tie.'),
  no_winner: m('No winner', 'Nobody qualified for this award.'),
  winner: m('Winner', 'Won this award.'),
  awarded: m('Awarded', 'The award has been given.'),
  tie: m('Exact tie', 'Two or more people had exactly the same score, so no single winner was named.'),
  none: m('None', 'Nothing to show for this period.'),
  no_eligible: m('Nobody eligible', 'No one met the attendance and report checks for this award.'),
  blocked: m('Waiting for data', 'Cannot be decided until the missing data is recorded.'),
  failed: m('Failed', 'A technical problem stopped the calculation; it will be retried.'),
  calculation_failed: m('Calculation failed', 'A technical problem stopped the calculation; it will be retried.'),
  not_calculated: m('Not calculated yet', 'The calculation has not run for this period.'),
  unavailable: m('Unavailable', 'Required data is missing, so no value is shown rather than a made-up zero.'),
  provisional: m('Provisional', 'Calculated from the data so far; it can still change.'),
  official: m('Official', 'Decided and recorded.'),
  healthy: m('Running normally', 'The scheduled work is up to date.'),
  forbidden: m('Not allowed', 'Your role cannot see or change this.'),
  eligible: m('Eligible', 'Meets the checks to take part.'),
  ineligible: m('Not eligible', 'Does not meet the checks this time.'),
  // Month close
  live: m('Live', 'Figures update as records change.'),
  draft: m('Draft', 'Being prepared; not closed yet.'),
  closed: m('Closed', 'The month is closed and its figures are kept as they were.'),
  correction: m('Being corrected', 'A director opened a correction for named records and dates.'),
  certified: m('Complete', 'Every required input was available when the month was closed.'),
  incomplete_uncertified: m('Closed with gaps', 'Closed while some inputs were missing, so it is not certified.'),
  superseded: m('Replaced', 'A later revision of this month replaced this one.'),
  frozen_period: m('Closed month', 'The month is closed; ordinary changes are blocked.'),
  // Provider work (Drive)
  not_requested: m('Not requested', 'No Drive work has been asked for.'),
  provider_unavailable: m('Drive not connected', 'Google Drive is not connected yet, so files are linked by hand.'),
  // Scale modes
  manual: m('Set by hand', 'A manager typed the scale in.'),
  hours: m('From hours logged', 'Each logged hour adds 12.5 times the multiplier.'),
  activity_count: m('From activity count', 'The number of activities times the scale of one.'),
  linked: m('Share of a linked mission', 'A percentage of another mission’s scale.'),
  // Checklist structure problems
  missing_parent: m('Parent row is missing', 'The row points at a parent that no longer exists.'),
  cycle: m('Rows point at each other', 'Two rows are each inside the other; move one out.'),
  // Task Tools results
  committed: m('Done', 'The change was saved.'),
  replayed: m('Already done', 'This exact change was saved before; nothing was repeated.'),
};

/** Why a performance factor, score or award is unavailable. */
const SCORING_REASONS: Record<string, CodeMeaning> = {
  raw_input_missing: m('No value recorded', 'There is no recorded value for this person and factor.'),
  raw_input_unavailable: m('Required input not available', 'An input this factor needs has not been recorded.'),
  invalid_numeric_source: m('Value needs checking', 'A recorded number could not be read and needs correcting.'),
  zero_excluded_by_cohort: m('Zero left out', 'This comparison leaves out people with a value of zero.'),
  member_excluded_from_factor_cohort: m('Not in the team comparison', 'This person is not part of the team median for this factor.'),
  factor_cohort_unapproved: m('Comparison group not set', 'Who this factor compares against has not been decided.'),
  factor_median_unavailable: m("Team median can't be calculated yet", 'Not enough team values are recorded to find the middle value.'),
  factor_window_unapproved: m('Time window not set', 'The period this factor covers has not been decided.'),
  factor_policy_unapproved: m('Rules not set', 'The rules for this factor are not approved yet.'),
  precision_policy_unapproved: m('Rounding not set', 'How final scores are rounded has not been approved.'),
  empty_member_population: m('No team members', 'There is nobody to compare in this period.'),
  task_history_before_observed_baseline: m('Before tracking began', 'Mission history from before tracking started is not available.'),
  task_and_member_history_before_observed_baseline: m('Before tracking began', 'Mission and member history from before tracking started is not available.'),
  history_before_input_baseline: m('Before tracking began', 'Records from before tracking began are not available.'),
  task_numeric_source_invalid: m('Mission value needs checking', 'A mission number could not be read and needs correcting.'),
  task_rate_source_missing: m('Mission rate missing', 'The mission has no hours or progress to work out a rate.'),
  task_rate_source_invalid: m('Mission rate needs checking', 'The mission rate could not be worked out from its records.'),
  task_hours_zero: m('No hours logged', 'The mission has no logged hours, so a per-hour rate is not possible.'),
  team_assigned_scale_zero: m('No measured workload assigned', 'Nobody has scaled work assigned, so loading cannot be compared.'),
  attendance_denominator_missing: m('Attendance not recorded', 'Productivity needs attendance hours, and some are missing.'),
  attendance_denominator_zero: m('No attendance hours', 'Productivity needs attendance hours, and the total is zero.'),
  attendance_unavailable: m('Attendance not recorded for some days', 'Every working day needs an attendance record before scores are final.'),
  attendance_invalid: m('Attendance does not cover the time logged', 'On some day the logged work is more than attendance plus off-hours.'),
  attendance_evidence_unavailable: m('Attendance not recorded', 'Attendance for the award day is missing.'),
  sales_field_mapping_missing: m("Sales weren't connected", 'Sales were not counted when this was calculated.'),
  sales_flags_missing: m('Sales entry incomplete', 'A sales entry is missing its new-project or payment flags.'),
  legacy_population_or_validation_provenance_missing: m('Older entries need review', 'Entries from the old sheet need reconciling before they count.'),
  legacy_population_unknown: m('Older entries need review', 'It is not known who the old sheet entries belong to.'),
  legacy_validation_provenance_missing: m('Older reviews unknown', 'Old sheet entries have no record of who reviewed them.'),
  legacy_author_missing: m('Author unknown', 'An old entry has no known author.'),
  shared_calculation_incomplete: m('Waiting for required data', 'Some inputs the score needs are still missing.'),
  required_inputs_unavailable: m('Waiting for required data', 'Some inputs the score needs are still missing.'),
  source_query_failed: m('Could not read the data', 'A technical problem stopped the data from loading; it will be retried.'),
  scale_nonpositive: m('Scale is not positive', 'A mission needs a scale above zero to count.'),
  freshness_unavailable: m('Freshness unknown', 'The mission is missing a date needed to work out freshness.'),
  // Task metric eligibility (the tasks contract)
  priority_no: m('Priority is No', 'Missions with priority No are not counted in performance.'),
  not_started: m('Not started', 'Missions that have not started are not counted yet.'),
  discarded: m('Discarded', 'Discarded missions are not counted.'),
  progress_missing: m('Progress is missing', 'No progress has been recorded yet.'),
  progress_below_15: m('Progress below 15%', 'A mission counts once it reaches 15% progress.'),
  scale_missing: m('Scale is missing', 'The mission has no scale yet.'),
};

/** Why a daily or monthly award could not be decided. */
const AWARD_REASONS: Record<string, CodeMeaning> = {
  award_cutoff_not_reached: m("Today's award isn't due yet", 'Daily awards are decided after the end of the day.'),
  award_policy_unapproved: m('Award rules not approved', 'The award rules are not approved yet.'),
  exact_tie_policy_unapproved: m('Tie rule not set', 'What happens on an exact tie has not been decided.'),
  exact_highest_score_tie: m('Exact tie for first', 'Two or more people had exactly the same top score, so nobody won.'),
  exact_monthly_tie: m('Exact tie for the month', 'Two or more people tied on daily wins and score, so nobody won.'),
  no_eligible_candidates: m('Nobody eligible', 'No one met the attendance and report checks that day.'),
  no_regular_attendance_on_award_day: m('No attendance that day', 'Only people who attended on the day can win it.'),
  candidate_gate_missing: m('Eligibility unknown', 'A candidate is missing their attendance check.'),
  candidate_population_mismatch: m('Team changed', 'The team changed during the calculation; it will be redone.'),
  candidate_evidence_unavailable: m('Candidate data missing', 'Some candidate scores could not be read.'),
  daily_coverage_incomplete: m('Not every day decided', 'Some days of the month have no decided daily star yet.'),
  no_effective_daily_wins: m('No daily wins yet', 'Nobody has a daily star this month yet.'),
  monthly_tie_break_unavailable: m('Tie-break not available', 'The month score used to break a tie is not available yet.'),
  shared_monthly_context_unavailable: m('Waiting for the monthly calculation', 'The monthly award needs the current month calculation first.'),
  historical_effective_award_context_unavailable: m('Earlier award data missing', 'Data for earlier awards is not available.'),
  frozen_period_retains_original_awards: m('Closed month keeps its awards', 'Awards in a closed month stay as they were decided.'),
  source_changed: m('Records changed', 'Records changed after the award was calculated; it will be recalculated.'),
  performance_source_invalidated: m('Records changed', 'Records changed after the score was calculated; it will be recalculated.'),
  performance_dated_invalidated: m('Records changed', 'A dated record changed after the score was calculated; it will be recalculated.'),
  task_metrics_invalidated: m('Mission changed', 'A mission changed after the score was calculated; it will be recalculated.'),
  monthly_star_winner: m('Star of the month', 'Most daily stars this month.'),
};

/** Why a day's attendance is not valid (the attendance input context). */
const ATTENDANCE_REASONS: Record<string, CodeMeaning> = {
  attendance_missing: m('No attendance recorded', 'Record attendance for this day.'),
  legacy_hours_unconfirmed: m('Hours need confirming', 'Hours came from the old sheet; save the record again to confirm them.'),
  effort_hours_invalid: m('Logged time needs checking', 'A time log for this day could not be read and needs correcting.'),
  attendance_hours_invalid: m('Hours need checking', 'The recorded hours could not be read and need correcting.'),
  attendance_state_hours_incompatible: m("Hours don't match the status", 'Absent and Leave have no hours; Holiday and Off Hours have only off-hours.'),
  effort_exceeds_attendance_capacity: m('More time logged than attended', 'Logged work is more than attendance plus off-hours for the day.'),
  no_elapsed_days: m('No days yet', 'No days of this period have passed yet.'),
  missing_hours: m('Hours missing', 'Enter the hours worked; a blank is not zero.'),
  invalid_hours: m('Hours need checking', 'Hours must be between 0 and 24.'),
};

const CODES: Record<string, CodeMeaning> = { ...STATES, ...SCORING_REASONS, ...AWARD_REASONS, ...ATTENDANCE_REASONS };

/** Every code the glossary knows, for tests and the guide's glossary page. */
export const KNOWN_CODES: readonly string[] = Object.keys(CODES);

/** A "factor:reason" code reads as its reason; an id suffix ("unsectioned:3f2a") is dropped. */
function lookup(code: string): CodeMeaning | undefined {
  const own = (key: string | undefined) => (key !== undefined && Object.hasOwn(CODES, key) ? CODES[key] : undefined);
  const [head, tail] = code.split(':');
  return own(code) ?? own(tail) ?? own(head);
}

/** Words for one code; `fallback` when the code is empty. */
export function codeLabel(code: string | null | undefined, fallback = 'Not recorded'): string {
  if (!code) return fallback;
  const known = lookup(code);
  if (known) return known.label;
  const words = code.split(':')[0].replaceAll('_', ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : fallback;
}

/** The one-line meaning of a code, or null when the glossary does not know it. */
export function codeMeaning(code: string | null | undefined): string | null {
  return code ? lookup(code)?.meaning ?? null : null;
}

/** Distinct labels for a list of codes, joined for one line of text. */
export function codeLabels(codes: readonly string[], separator = '; '): string {
  return [...new Set(codes.map(code => codeLabel(code)))].join(separator);
}

/* -------------------------------------------------------------------------- */
/* Enum meanings                                                              */
/* -------------------------------------------------------------------------- */

export const TASK_STATUS_MEANINGS = {
  'Not Started': 'Assigned, but no work recorded yet. Not counted in performance.',
  'In Progress': 'Work has started and progress is being recorded.',
  Done: 'Finished: Setup, Activity and Closure are complete and reviews have passed.',
  Discarded: 'Cancelled by a manager. Kept for the record but not counted.',
  Stopped: 'Stopped by a manager. Progress so far is kept.',
  'On-Hold': 'Paused for now; it can be resumed.',
  Carryover: 'Moved on to the next month to be finished there.',
} satisfies Record<TaskStatus, string>;

export const TASK_PRIORITY_MEANINGS = {
  Focus: 'Top priority. Weighs 1.2 in criticality.',
  High: 'Important. Weighs 1 in criticality.',
  Medium: 'Normal priority. Weighs 0.75 in criticality.',
  Low: 'Can wait. Weighs 0.5 in criticality.',
  No: 'Not counted in performance at all.',
} satisfies Record<TaskPriority, string>;

export const TASK_FRESHNESS_MEANINGS = {
  'Super Fresh': 'Assigned in the last 3 days. Scores +3.',
  Fresh: 'On or before its due date. Scores +2.',
  'Almost Fresh': 'Up to 2 days past due. Scores +1.',
  'Almost Stale': '3 or 4 days past due. Scores −1.',
  Stale: '5 to 7 days past due. Scores −2.',
  Rotten: 'More than a week past due. Scores −3.',
} satisfies Record<TaskFreshness, string>;

export const ATTENDANCE_STATUS_MEANINGS = {
  Present: 'A working day. Enter the hours worked (usually 8).',
  Absent: 'Not at work. Regular and off-hours are both zero.',
  'Half Day': 'A part day. Enter the hours worked (usually 4).',
  Holiday: 'A holiday. No regular hours; any work goes in off-hours.',
  Leave: 'On leave. Regular and off-hours are both zero.',
  'Off Hours': 'Worked outside the regular day. Only off-hours count.',
} satisfies Record<AttendanceStatus, string>;

export const ROLE_MEANINGS = {
  managing_director: 'Sees and manages everything, closes months and decides awards.',
  project_engineer: 'Manages missions, people and attendance for the team.',
  data_manager: 'Reviews daily facts, ideas, suggestions and sales.',
  team_member: 'Works on missions and records their own time and attendance.',
} satisfies Record<UserRole, string>;

export const CATEGORY_MEANINGS = {
  SD: 'Learning and training. Skill support splits use this category.',
  WK: 'Planning and organising the work itself.',
  T: 'Everyday work that fits no other category.',
  PJT: 'Core project work for clients.',
  RSC: 'Studying, comparing and analysing options.',
  QAC: 'Checking quality and testing work.',
  MKT: 'Marketing, outreach and client contact.',
  ACC: 'Accounts, billing and finance.',
  ITH: 'Computers, software and systems.',
  OFM: 'Running the office and its facilities.',
  MG: 'Management decisions and strategy.',
  AD: 'Administration and daily operations.',
  OT: 'Other work, including work outside office hours.',
} satisfies Record<TaskCategory, string>;

export const CHECKLIST_NODE_MEANINGS = {
  Page: 'A checklist page of its own, opened from its parent.',
  Group: 'A heading; its progress is the average of what is inside it.',
  Item: 'One check answered Yes, No or N/A.',
  Task: 'Another mission whose progress counts here.',
} satisfies Record<ChecklistNodeType, string>;

export const MILESTONE_STATUS_MEANINGS = {
  Planned: 'Agreed, not started yet.',
  'In Progress': 'Being worked towards now.',
  Achieved: 'Reached.',
} satisfies Record<MilestoneStatus, string>;

/* -------------------------------------------------------------------------- */
/* Terms explained by a HelpTip                                               */
/* -------------------------------------------------------------------------- */

export type GuideTopic = 'missions' | 'checklist' | 'time' | 'records' | 'recognition' | 'waypoints' | 'policies' | 'reports' | 'analytics';

export interface GlossaryTerm {
  readonly term: string;
  readonly meaning: string;
  /** The guide page (and section) that explains it in full. */
  readonly topic: GuideTopic;
  readonly anchor: string;
}

const t = (term: string, meaning: string, topic: GuideTopic, anchor: string): GlossaryTerm => ({ term, meaning, topic, anchor });

export const GLOSSARY = {
  asOf: t('As of', 'The moment the figures are read at. Later changes do not alter what was true then.', 'reports', 'as-of'),
  retained: t('Kept history', 'Every change is kept, so earlier versions stay readable. Nothing is overwritten.', 'records', 'history'),
  gate: t('Attendance check', 'To take part in awards, logged work each day must fit within attendance plus off-hours. It is a check, not a bonus.', 'records', 'attendance'),
  scale: t('Scale', 'How big a mission is. Progress times scale is the work it is worth.', 'missions', 'scale'),
  freshness: t('Freshness', 'How on-time a mission is, from Super Fresh (+3) to Rotten (−3).', 'missions', 'freshness'),
  medianDifference: t('Difference from the team median', 'Each factor compares you with the middle value of the team. Above the middle is positive, below is negative.', 'analytics', 'median'),
  waypoint: t('Waypoint', 'A named stage a mission reaches at 30, 50, 70, 90 and 100% progress. It stays reached and never changes a score.', 'waypoints', 'waypoints'),
  commendation: t('Commendation', 'Recognition a policy gives when its conditions are met. It never changes a score.', 'policies', 'commendations'),
  eligible: t('Counted in performance', 'A mission counts once it has a scale, a priority other than No, has started and reached 15%.', 'missions', 'eligibility'),
  sections: t('Setup, Activity, Closure', 'Activity drives progress. All three, plus reviews, must be complete before Done.', 'checklist', 'sections'),
  loading: t('Loading', 'Your share of the team’s assigned work, shown as a percentage.', 'analytics', 'factors'),
  productivity: t('Productivity', 'Work done (progress times scale) per attendance hour.', 'analytics', 'factors'),
  offHours: t('Off-hours', 'Work outside the regular day, recorded separately from regular hours.', 'records', 'attendance'),
  period: t('Period', 'A calendar month in India time. Pick a month and when to read it.', 'reports', 'as-of'),
  pending: t('Waiting for review', 'Saved entries count at a lower rate until someone else validates them.', 'records', 'review'),
  monthClose: t('Month close', 'Closing keeps the month’s figures as they were. Corrections need a director and a reason.', 'reports', 'close'),
} satisfies Record<string, GlossaryTerm>;

export type GlossaryKey = keyof typeof GLOSSARY;

/** The guide link for a glossary term. */
export function guideHref(term: Pick<GlossaryTerm, 'topic' | 'anchor'>): string {
  return `/guide/${term.topic}#${term.anchor}`;
}
