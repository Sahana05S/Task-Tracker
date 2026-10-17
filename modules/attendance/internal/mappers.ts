import type { AttendanceRecordRow } from '@/types/database';
import type { AttendanceRecord } from '@/types/tracker';

export const ATTENDANCE_COLUMNS =
  'id, user_id, attendance_date, status, check_in_at, check_out_at, attendance_hours, off_hours, holiday_name, notes, recorded_by, created_at, updated_at, record_version, hours_confirmed, record_state' as const;

export function mapAttendanceRecord(
  row: AttendanceRecordRow,
): AttendanceRecord {
  return {
    id: row.id,
    userId: row.user_id,
    attendanceDate: row.attendance_date,
    status: row.status,
    checkInAt: row.check_in_at,
    checkOutAt: row.check_out_at,
    attendanceHours: row.attendance_hours,
    offHours: row.off_hours,
    holidayName: row.holiday_name,
    notes: row.notes,
    recordedBy: row.recorded_by,
    recordVersion: row.record_version ?? 0,
    hoursConfirmed: row.hours_confirmed ?? false,
    recordState: row.record_state ?? 'active',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAttendanceRecords(
  rows: readonly AttendanceRecordRow[],
): AttendanceRecord[] {
  return rows.map(mapAttendanceRecord);
}
