// PRIVATE (client-safe via client.ts). Plain words for outcomes and reason
// codes, so no screen renders a raw code.
import { plural } from './templates/spec';
import { shortDate } from './periods';
import type { Outcome, Reason } from './types';

export const OUTCOME_LABELS: Record<Outcome, { final: string; provisional: string }> = {
  met: { final: 'Met', provisional: 'On track' },
  not_met: { final: 'Not met', provisional: 'Not yet' },
  unavailable: { final: 'Cannot be judged', provisional: 'Waiting for data' },
};

export function outcomeLabel(outcome: Outcome, final: boolean): string {
  return OUTCOME_LABELS[outcome][final ? 'final' : 'provisional'];
}

/** One sentence per reason code; {n} is the count, {limit} the allowance. */
export const REASON_LABELS: Record<string, string> = {
  attendance_missing: 'No attendance recorded on {days}.',
  check_in_missing: 'No check-in time recorded on {days}.',
  late: 'Checked in after the cut-off on {days}.',
  late_within_grace: 'Late on {days}, within the allowance.',
  too_few_working_days: 'Only {n} working days; the policy needs {limit}.',
  no_working_days: 'No working days to judge (holidays, leave or off days only).',
  absent: 'Absent on {days}.',
  leave_over_allowance: 'On leave {n} days; {limit} allowed.',
  below_min_hours: 'Logged less than {limit} h on {days}.',
  hours_exceed_attendance: 'Logged more hours than attendance on {days}.',
  hours_unconfirmed: 'Attendance hours not confirmed on {days}.',
  streak_short: 'Longest active-day streak was {n} days; {limit} needed.',
  contributions_short: '{n} validated so far; {limit} needed.',
  overdue_tasks: '{n} open missions past their due date; {limit} allowed.',
  rotten_tasks: '{n} rotten missions at the end of the period.',
  stale_tasks: '{n} stale missions; {limit} allowed.',
  undated_tasks: '{n} missions without assigned or due dates, so freshness cannot be judged.',
};

function listDays(dates: string[] = []): string {
  if (!dates.length) return 'some days';
  const shown = dates.slice(0, 4).map(shortDate);
  return dates.length > 4 ? `${shown.join(', ')} and ${plural(dates.length - 4, 'more day')}` : shown.join(', ');
}

export function describeReason(reason: Reason): string {
  const template = REASON_LABELS[reason.code] ?? 'Another condition applies.';
  return template
    .replace('{days}', listDays(reason.dates))
    .replace('{n}', String(reason.count ?? 0))
    .replace('{limit}', String(reason.limit ?? 0));
}
