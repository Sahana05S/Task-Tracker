import type { User } from '@/types/tracker';

export function canViewTeamModule(user: Pick<User, 'isActive'>): boolean {
  return user.isActive;
}

export function canViewEmployeeProfile(
  viewer: Pick<User, 'isActive'>,
  employee: Pick<User, 'isActive'>,
): boolean {
  return viewer.isActive && employee.isActive;
}

export function canViewEmployeeReports(
  viewer: Pick<User, 'isActive'>,
  employee: Pick<User, 'isActive'>,
): boolean {
  return canViewEmployeeProfile(viewer, employee);
}
