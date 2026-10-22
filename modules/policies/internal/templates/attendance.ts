// PRIVATE. Attendance and hours templates.
import { PERIOD_LABELS } from '../periods';
import { bool, dayKind, decide, isWorking, noWorkingDays, num, plural, reason, type PolicyTemplate } from './spec';

const EPSILON = 1e-9;

export const fullAttendance: PolicyTemplate = {
  key: 'full_attendance',
  label: 'Full attendance',
  summary: (p, kind) => {
    const leave = num(p, 'allowedLeaveDays', 0);
    return `No absent day in the ${PERIOD_LABELS[kind].noun}`
      + (leave > 0 ? ` and at most ${plural(leave, 'leave day')}.` : ' and no leave.');
  },
  periodKinds: ['day', 'week', 'month'],
  parameters: [{ key: 'allowedLeaveDays', label: 'Leave days allowed', type: 'integer', min: 0, max: 31 }],
  defaults: { allowedLeaveDays: 0 },
  defaultReward: { badge: 'Ever present', points: 20 },
  ruleVersion: 'full_attendance@1',
  evaluate: ({ member, today }, p) => {
    const allowed = num(p, 'allowedLeaveDays', 0);
    const absent: string[] = [], leave: string[] = [], missing: string[] = [];
    for (const day of member.days) {
      const kind = dayKind(day, today);
      if (kind === 'absent') absent.push(day.date);
      else if (kind === 'leave') leave.push(day.date);
      else if (kind === 'missing') missing.push(day.date);
    }
    const failed = [
      ...(absent.length ? [reason('absent', absent)] : []),
      ...(leave.length > allowed ? [reason('leave_over_allowance', leave, { limit: allowed })] : []),
    ];
    return decide(failed, missing.length ? [reason('attendance_missing', missing)] : [], { absentDays: absent, leaveDays: leave });
  },
};

export const loggedEveryWorkingDay: PolicyTemplate = {
  key: 'logged_every_working_day',
  label: 'Time logged every working day',
  summary: (p, kind) => `Log at least ${num(p, 'minHours', 0.25)} h on every working day of the ${PERIOD_LABELS[kind].noun}.`,
  periodKinds: ['day', 'week', 'month'],
  parameters: [
    { key: 'minHours', label: 'Minimum hours a day', type: 'number', min: 0.25, max: 12, step: 0.25, unit: 'h' },
    { key: 'halfDaysCount', label: 'Half days are working days', type: 'boolean' },
  ],
  defaults: { minHours: 0.25, halfDaysCount: true },
  defaultReward: { badge: 'Steady logger', points: 15 },
  ruleVersion: 'logged_every_working_day@1',
  evaluate: ({ member, today }, p) => {
    const min = num(p, 'minHours', 0.25);
    const halfDays = bool(p, 'halfDaysCount', true);
    const short: string[] = [], missing: string[] = [];
    let working = 0;
    for (const day of member.days) {
      const kind = dayKind(day, today);
      if (kind === 'missing') { missing.push(day.date); continue; }
      if (!isWorking(kind, halfDays)) continue;
      working += 1;
      // Today can still be logged.
      if (day.loggedHours + EPSILON < min && day.date < today) short.push(day.date);
    }
    return decide(short.length ? [reason('below_min_hours', short, { limit: min })] : [], [
      ...(missing.length ? [reason('attendance_missing', missing)] : []),
      ...noWorkingDays(working, short.length + missing.length),
    ], { workingDays: working, shortDays: short, minHours: min });
  },
};

export const hoursWithinAttendance: PolicyTemplate = {
  key: 'hours_within_attendance',
  label: 'Logged hours within attendance',
  summary: (_p, kind) => `On every day of the ${PERIOD_LABELS[kind].noun}, logged hours stay within confirmed regular plus off hours.`,
  periodKinds: ['day', 'week', 'month'],
  parameters: [],
  defaults: {},
  defaultReward: { badge: 'Honest hours', points: 10 },
  ruleVersion: 'hours_within_attendance@1',
  evaluate: ({ member }) => {
    const over: string[] = [], unconfirmed: string[] = [], noRecord: string[] = [];
    for (const day of member.days) {
      if (day.loggedHours <= 0) continue;
      if (day.status === null) { noRecord.push(day.date); continue; }
      if (!day.hoursConfirmed || day.regularHours === null || day.offHours === null) { unconfirmed.push(day.date); continue; }
      if (day.loggedHours > day.regularHours + day.offHours + EPSILON) over.push(day.date);
    }
    return decide(over.length ? [reason('hours_exceed_attendance', over)] : [], [
      ...(noRecord.length ? [reason('attendance_missing', noRecord)] : []),
      ...(unconfirmed.length ? [reason('hours_unconfirmed', unconfirmed)] : []),
    ], { overDays: over });
  },
};
