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
  statusHours,
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
  withStatus,
  type AttendanceMatrixModel,
  type CellValues,
  type DayFill,
  type MatrixCell,
  type MatrixRow,
} from './internal/matrix';
export {
  compressPhoto,
  mapEmbed,
  mapLink,
  MAX_PHOTO_BYTES,
  type CheckInKind,
  type CheckInMark,
} from './internal/check-in-model';
