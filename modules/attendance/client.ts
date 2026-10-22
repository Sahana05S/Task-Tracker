// PUBLIC client-safe exports: types and pure helpers only (no server imports).
export {
  ATTENDANCE_INPUT_VERSION,
  compareRecordedHours,
  dailyAttendanceValidity,
  localCheckTime,
  type AttendanceObservation,
  type AttendanceValidity,
} from './internal/contract';
export { ATTENDANCE_COLUMNS, mapAttendanceRecord, mapAttendanceRecords } from './internal/mappers';
export { canEditAttendanceRecord, canManageAttendance } from './internal/permissions';
export {
  computeHoursFromCheckTimes,
  defaultHoursForStatus,
  EMPTY_ATTENDANCE_SUMMARY,
  summarizeAttendance,
  type AttendanceSummary,
} from './internal/summary';
export {
  attendanceMatrix,
  attendanceMonth,
  cellCommand,
  cellValues,
  emptyCells,
  fillCommand,
  hoursBetween,
  monthDates,
  shiftMonth,
  withStatus,
  type AttendanceMatrixModel,
  type CellValues,
  type DayFill,
  type DayKind,
  type MatrixCell,
  type MatrixRow,
} from './internal/matrix';
