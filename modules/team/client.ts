// PUBLIC client-safe API of the team module: who may view what, employee
// routes, the employee chart builder and team mappers. No server imports.

export { canViewEmployeeProfile, canViewEmployeeReports, canViewTeamModule } from '@/modules/team/internal/permissions';
export { employeeHref, employeeReportsHref, normalizeEmployeeIdParam, type EmployeeRouteState } from '@/modules/team/internal/routes';
export {
  buildEmployeeAnalyticsCharts,
  type EmployeeAnalyticsChartInput,
  type EmployeeAnalyticsCharts,
  type EmployeeDistributionBucket,
  type EmployeeTrendPoint,
} from '@/modules/team/internal/employee-charts';
export { optionalEmployeePerformance } from '@/modules/team/internal/performance-availability';
export type { Invitation, PeopleAdminData, Placement } from '@/modules/team/internal/people';
export {
  buildOrgTree,
  parseOrgChart,
  teamSize,
  TODAY_STATUSES,
  type OrgChart,
  type OrgNode,
  type OrgPerson,
  type TodayStatus,
} from '@/modules/team/internal/org-tree';
