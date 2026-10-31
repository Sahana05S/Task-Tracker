import { roundToNumericScale } from '@/modules/time-tracking/client';
import type { AttendanceRecord, AttendanceStatus } from '@/types/tracker';

export interface AttendanceSummary {
  readonly recordCount: number;
  readonly attendanceHours: number;
  readonly offHours: number;
  readonly presentDays: number;
  readonly absentDays: number;
  readonly halfDays: number;
  readonly holidays: number;
  readonly leaveDays: number;
  readonly offHourDays: number;
  /**
   * Present 1, Half Day 0.5, Holiday 1: an attendance count, not payroll's
   * days worked (P + 0.75 UD + 0.5 HD, migration 74), so it is never labelled payable.
   */
  readonly payableDays: number;
}

export const EMPTY_ATTENDANCE_SUMMARY: AttendanceSummary = {
  recordCount: 0,
  attendanceHours: 0,
  offHours: 0,
  presentDays: 0,
  absentDays: 0,
  halfDays: 0,
  holidays: 0,
  leaveDays: 0,
  offHourDays: 0,
  payableDays: 0,
};

export function summarizeAttendance(
  records: readonly Pick<
    AttendanceRecord,
    'status' | 'attendanceHours' | 'offHours'
  >[],
): AttendanceSummary {
  const summary = { ...EMPTY_ATTENDANCE_SUMMARY };

  for (const record of records) {
    summary.recordCount++;
    summary.attendanceHours += record.attendanceHours;
    summary.offHours += record.offHours;

    switch (record.status) {
      case 'Present':
        summary.presentDays++;
        summary.payableDays += 1;
        break;
      case 'Half Day':
        summary.halfDays++;
        summary.payableDays += 0.5;
        break;
      case 'Holiday':
        summary.holidays++;
        summary.payableDays += 1;
        break;
      case 'Leave':
        summary.leaveDays++;
        break;
      case 'Off Hours':
        summary.offHourDays++;
        break;
      case 'Absent':
        summary.absentDays++;
        break;
    }
  }

  return {
    ...summary,
    attendanceHours: roundToNumericScale(summary.attendanceHours),
    offHours: roundToNumericScale(summary.offHours),
    payableDays: roundToNumericScale(summary.payableDays),
  };
}

/** Which hours a status takes: regular hours only on a working day; no hours at all when absent or on leave. */
export function statusHours(status: AttendanceStatus): { readonly regular: boolean; readonly off: boolean } {
  return { regular: status === 'Present' || status === 'Half Day', off: status !== 'Absent' && status !== 'Leave' };
}

export function defaultHoursForStatus(status: AttendanceStatus): {
  readonly attendanceHours: number;
  readonly offHours: number;
} {
  switch (status) {
    case 'Present':
      return { attendanceHours: 8, offHours: 0 };
    case 'Half Day':
      return { attendanceHours: 4, offHours: 0 };
    case 'Off Hours':
      return { attendanceHours: 0, offHours: 8 };
    default:
      return { attendanceHours: 0, offHours: 0 };
  }
}

export function computeHoursFromCheckTimes(
  checkInAt: Date | null,
  checkOutAt: Date | null,
): number | null {
  if (!checkInAt || !checkOutAt) return null;
  const elapsedMs = checkOutAt.getTime() - checkInAt.getTime();
  if (elapsedMs <= 0) return 0;
  // Truncated to 2 places like attendance_check_in (trunc) and the matrix editor (floor).
  return Math.floor(elapsedMs / (1000 * 60 * 60) * 100) / 100;
}
