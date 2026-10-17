// PUBLIC server-side API of the attendance module. Pure helpers live in client.ts.
export * from './client';
export { getAttendanceModuleData, type AttendanceModuleData, type AttendanceMemberSummary } from './internal/queries';
export { getTeamHolidayDates } from './internal/holidays';
