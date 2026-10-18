// PUBLIC server-side API of the team module (team index, employee profiles and
// reports). Server code imports from here; 'use client' code imports
// '@/modules/team/client'. Settings commands are in '@/modules/team/profile-actions'.

export * from '@/modules/team/client';

export { resolveEmployeeRouteState } from '@/modules/team/internal/routes';
export {
  getEmployeeByEmployeeId,
  getEmployeeProfileData,
  getEmployeeReportsData,
  getTeamIndexData,
  type EmployeeProfileData,
  type EmployeeReportsData,
  type TeamIndexData,
  type TeamIndexMember,
} from '@/modules/team/internal/queries';
export { getMemberNames } from '@/modules/team/internal/member-names';
