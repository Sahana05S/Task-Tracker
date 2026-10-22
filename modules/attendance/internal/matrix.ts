import type { AttendanceInputContext } from '@/modules/support/client';
import { kolkataTime } from '@/shared/time/kolkata';
import { isMonthKey, monthDates, monthPeriod, shiftMonth, type AnalyticsPeriod } from '@/shared/time/period';
import type { AttendanceRecord, AttendanceStatus, User } from '@/types/tracker';
import { defaultHoursForStatus, statusHours } from './summary';

/**
 * The attendance month matrix: members by days, built from what attendance
 * already returns (records and the per-day check). It adds no rule; the
 * database still validates every save.
 */

export type DayKind = 'past' | 'today' | 'future';

export interface MatrixCell {
  readonly date: string;
  readonly kind: DayKind;
  /** The kept record for this member and day, active or withdrawn. */
  readonly recordId: string | null;
  readonly version: number;
  readonly status: AttendanceStatus | null;
  readonly withdrawn: boolean;
  readonly attendanceHours: number | null;
  readonly offHours: number | null;
  /** HH:MM, India time. */
  readonly checkIn: string;
  readonly checkOut: string;
  readonly holidayName: string;
  readonly notes: string;
  readonly hoursConfirmed: boolean;
  /** The attendance check for an elapsed day; null when not checked. */
  readonly check: 'passes' | 'fails' | 'unavailable' | null;
  readonly effortHours: number | null;
  readonly reasons: readonly string[];
}

export interface MatrixRow {
  readonly member: Pick<User, 'id' | 'fullName' | 'employeeId' | 'isActive'>;
  readonly cells: readonly MatrixCell[];
  /** Ended days with no active record. */
  readonly missing: number;
}

export interface AttendanceMatrixModel {
  /** YYYY-MM */
  readonly month: string;
  /** `label` is the long date ("Wednesday 21 October"), built once per day for headers and cell names. */
  readonly days: readonly { readonly date: string; readonly kind: DayKind; readonly weekday: string; readonly day: number; readonly weekend: boolean; readonly label: string }[];
  readonly rows: readonly MatrixRow[];
}

const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' });
const LONG_DATE = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

/**
 * The month the page shows from `?month=YYYY-MM`: this month when absent, and
 * this month with a message when malformed or not started yet.
 */
export function attendanceMonth(value: string | undefined, today: string): { period: AnalyticsPeriod; previous: string; next: string | null; error: string | null } {
  const current = today.slice(0, 7);
  const month = isMonthKey(value) && value <= current ? value : current;
  const error = value === undefined || month === value ? null : isMonthKey(value) ? 'That month has not started yet. Showing this month.' : 'That month could not be read. Showing this month.';
  const following = shiftMonth(month, 1);
  return { period: monthPeriod(month), previous: shiftMonth(month, -1), next: following <= current ? following : null, error };
}

const hours = (value: string | number | null | undefined) => (value === null || value === undefined || value === '' ? null : Number(value));

export function attendanceMatrix({ month, today, members, records, contexts }: {
  month: string;
  today: string;
  members: readonly Pick<User, 'id' | 'fullName' | 'employeeId' | 'isActive'>[];
  records: readonly AttendanceRecord[];
  contexts: ReadonlyMap<string, AttendanceInputContext>;
}): AttendanceMatrixModel {
  const dates = monthDates(month);
  const days = dates.map(date => {
    const at = new Date(`${date}T00:00:00Z`);
    return {
      date,
      kind: (date < today ? 'past' : date === today ? 'today' : 'future') as DayKind,
      weekday: WEEKDAY.format(at),
      day: at.getUTCDate(),
      weekend: at.getUTCDay() === 0,
      label: LONG_DATE.format(at),
    };
  });
  const byKey = new Map(records.map(record => [`${record.userId}:${record.attendanceDate}`, record]));
  const recorded = new Set(records.map(record => record.userId));
  const rows = members
    .filter(member => member.isActive || recorded.has(member.id))
    .map(member => {
      const checks = new Map((contexts.get(member.id)?.days ?? []).map(day => [day.businessDate, day]));
      const cells = days.map(({ date, kind }): MatrixCell => {
        const record = byKey.get(`${member.id}:${date}`);
        const check = checks.get(date);
        const withdrawn = record?.recordState === 'withdrawn';
        return {
          date,
          kind,
          recordId: record?.id ?? null,
          version: record?.recordVersion ?? 0,
          status: record && !withdrawn ? record.status : null,
          withdrawn,
          attendanceHours: record && !withdrawn && record.hoursConfirmed !== false ? record.attendanceHours : null,
          offHours: record && !withdrawn && record.hoursConfirmed !== false ? record.offHours : null,
          checkIn: record?.checkInAt ? kolkataTime(new Date(record.checkInAt)) : '',
          checkOut: record?.checkOutAt ? kolkataTime(new Date(record.checkOutAt)) : '',
          holidayName: record?.holidayName ?? '',
          notes: record?.notes ?? '',
          hoursConfirmed: record?.hoursConfirmed !== false,
          check: !check ? null : !check.available ? 'unavailable' : check.valid ? 'passes' : 'fails',
          effortHours: hours(check?.effortHours),
          reasons: check?.reasons ?? [],
        };
      });
      return {
        member: { id: member.id, fullName: member.fullName, employeeId: member.employeeId, isActive: member.isActive },
        cells,
        // Today can still be recorded, so only days that have ended count as missing.
        missing: cells.filter(cell => cell.kind === 'past' && !cell.status).length,
      };
    });
  return { month, days, rows };
}

/* -------------------------------------------------------------------------- */
/* Editing                                                                    */
/* -------------------------------------------------------------------------- */

export interface CellValues {
  readonly status: AttendanceStatus;
  readonly attendanceHours: string;
  readonly offHours: string;
  readonly checkIn: string;
  readonly checkOut: string;
  readonly holidayName: string;
  readonly notes: string;
  /** Required by the database when correcting an existing record. */
  readonly reason: string;
}

/** The editor's starting values: the record, or the usual hours for a new day. */
export function cellValues(cell: MatrixCell): CellValues {
  const status = cell.status ?? 'Present';
  const defaults = defaultHoursForStatus(status);
  return {
    status,
    attendanceHours: String(cell.attendanceHours ?? defaults.attendanceHours),
    offHours: String(cell.offHours ?? defaults.offHours),
    checkIn: cell.checkIn,
    checkOut: cell.checkOut,
    holidayName: cell.holidayName,
    notes: cell.notes,
    reason: '',
  };
}

/**
 * Status change in the editor: the usual 8 / 4 hours for Present and Half
 * Day, zero regular hours otherwise. Off-hours a person entered are kept
 * where the status allows them.
 */
export function withStatus(values: CellValues, status: AttendanceStatus): CellValues {
  const defaults = defaultHoursForStatus(status);
  const keepsOffHours = statusHours(status).off && status !== 'Off Hours';
  return {
    ...values,
    status,
    attendanceHours: String(defaults.attendanceHours),
    offHours: keepsOffHours && Number(values.offHours) > 0 ? values.offHours : String(defaults.offHours),
  };
}

/**
 * Hours between two HH:MM times on one day, rounded down to two decimals so
 * they never exceed the span the database checks; null if not a forward pair.
 */
export function hoursBetween(checkIn: string, checkOut: string): number | null {
  const minutes = (time: string) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : null);
  const start = minutes(checkIn);
  const end = minutes(checkOut);
  if (start === null || end === null || end <= start) return null;
  return Math.floor(((end - start) / 60) * 100) / 100;
}

/**
 * The fields `dated_record_command` takes for one cell (the records module
 * parses them). New days save at version 0 without a reason; an existing or
 * withdrawn record is corrected at its version with a reason.
 */
export function cellCommand(memberId: string, cell: Pick<MatrixCell, 'date' | 'recordId' | 'version'>, values: CellValues): Record<string, string> {
  return {
    kind: 'attendance',
    command: 'save',
    recordId: cell.recordId ?? '',
    expectedVersion: String(cell.recordId ? cell.version : 0),
    author_id: memberId,
    business_date: cell.date,
    attendance_status: values.status,
    attendance_hours: values.attendanceHours.trim(),
    off_hours: values.offHours.trim(),
    check_in_time: values.checkIn,
    check_out_time: values.checkOut,
    holiday_name: values.status === 'Holiday' ? values.holidayName.trim() : '',
    content: values.notes.trim(),
    reason: cell.recordId ? values.reason.trim() : '',
  };
}

/* -------------------------------------------------------------------------- */
/* Filling a day for everyone                                                 */
/* -------------------------------------------------------------------------- */

export type DayFill = 'Holiday' | 'Present' | 'Half Day';

/**
 * Active members with no record (active or withdrawn) on a date: the only
 * cells a fill may create. Inactive members cannot be written for.
 */
export function emptyCells(model: AttendanceMatrixModel, date: string): string[] {
  return model.rows.filter(row => row.member.isActive && row.cells.some(cell => cell.date === date && !cell.recordId)).map(row => row.member.id);
}

/** The command fields for one new record of a day fill. */
export function fillCommand(memberId: string, date: string, fill: DayFill, holidayName: string): Record<string, string> {
  const empty: CellValues = { status: 'Present', attendanceHours: '0', offHours: '0', checkIn: '', checkOut: '', holidayName: '', notes: '', reason: '' };
  return cellCommand(memberId, { date, recordId: null, version: 0 }, { ...withStatus(empty, fill), holidayName });
}
