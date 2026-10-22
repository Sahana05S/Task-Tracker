// PRIVATE. "On time every working day" (the managing director's example).
import { PERIOD_LABELS } from '../periods';
import { bool, dayKind, decide, isWorking, noWorkingDays, num, plural, reason, str, type PolicyTemplate } from './spec';

export const onTimeAllPeriod: PolicyTemplate = {
  key: 'on_time_all_period',
  label: 'On time every working day',
  summary: (p, kind) => {
    const grace = num(p, 'graceDays', 0);
    return `Check in by ${str(p, 'cutoff', '09:30')} on every working day of the ${PERIOD_LABELS[kind].noun}`
      + (grace > 0 ? `, with ${plural(grace, 'late day')} allowed.` : '.');
  },
  periodKinds: ['day', 'week', 'month'],
  parameters: [
    { key: 'cutoff', label: 'Check in by', type: 'time', help: 'Asia/Kolkata time. A check-in at this minute is on time.' },
    { key: 'graceDays', label: 'Late days allowed', type: 'integer', min: 0, max: 10 },
    { key: 'minWorkingDays', label: 'Minimum working days', type: 'integer', min: 0, max: 31, help: 'Fewer working days in the period and the policy is not met.' },
    { key: 'halfDaysCount', label: 'Half days are working days', type: 'boolean' },
    {
      key: 'missingCheckIn', label: 'No check-in time recorded', type: 'choice',
      options: [{ value: 'unavailable', label: 'Cannot be judged' }, { value: 'late', label: 'Counts as late' }],
    },
  ],
  defaults: { cutoff: '09:30', graceDays: 0, minWorkingDays: 0, halfDaysCount: true, missingCheckIn: 'unavailable' },
  defaultReward: { badge: 'Punctual', points: 20 },
  ruleVersion: 'on_time_all_period@1',
  evaluate: ({ member, today, final }, p) => {
    const cutoff = str(p, 'cutoff', '09:30');
    const grace = num(p, 'graceDays', 0);
    const minDays = num(p, 'minWorkingDays', 0);
    const halfDays = bool(p, 'halfDaysCount', true);
    const missingIsLate = str(p, 'missingCheckIn', 'unavailable') === 'late';
    const late: string[] = [], noCheckIn: string[] = [], missing: string[] = [];
    let working = 0;
    for (const day of member.days) {
      const kind = dayKind(day, today);
      if (kind === 'missing') { missing.push(day.date); continue; }
      if (!isWorking(kind, halfDays)) continue;
      working += 1;
      if (day.checkIn === null) {
        if (day.date >= today) continue; // today's check-in may still be recorded
        (missingIsLate ? late : noCheckIn).push(day.date);
      } else if (day.checkIn > cutoff) late.push(day.date);
    }
    const failed = late.length > grace ? [reason('late', late, { limit: grace })] : [];
    // Too few working days is known only when no day is missing.
    if (final && !missing.length && working < minDays) failed.push(reason('too_few_working_days', [], { count: working, limit: minDays }));
    const gaps = [
      ...(missing.length ? [reason('attendance_missing', missing)] : []),
      ...(noCheckIn.length ? [reason('check_in_missing', noCheckIn)] : []),
      ...noWorkingDays(working, failed.length + missing.length),
    ];
    const allowed = late.length && late.length <= grace ? [reason('late_within_grace', late, { limit: grace })] : [];
    return decide(failed, gaps, { workingDays: working, lateDays: late, cutoff }, allowed);
  },
};
