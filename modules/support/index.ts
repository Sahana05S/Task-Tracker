// PUBLIC server-side API of the support module. Re-export only what other code needs.
export {
  getSupportModuleData,
  summarizeEmployeeSupport,
  summarizeSupport,
  type EmployeeSupportSummary,
  type ModuleSummary,
  type SupportModuleData,
  type SupportSummary,
} from './internal/queries';
export { getMeetingPointsData, type MeetingPointsData } from './internal/meeting-queries';
export {
  loadAttendanceContext,
  loadContributionContext,
  parseInputContext,
} from './internal/input-context';
export {
  getMemberContributionStates,
  getRecentValidatedContributions,
  type RecentValidatedContribution,
} from './internal/today-queries';
export * from './client';
