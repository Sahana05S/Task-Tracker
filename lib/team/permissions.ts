import type { User } from '@/types/tracker';
import { canManageTasks } from '@/lib/tasks/permissions';

export function canViewTeamModule(user: Pick<User, 'isActive'>): boolean { return user.isActive; }
export function canViewEmployeeProfile(viewer: Pick<User, 'id' | 'role' | 'isActive'>, employee: Pick<User, 'id'>): boolean {
  return viewer.isActive && (viewer.id === employee.id || canManageTasks(viewer.role));
}
export const canViewEmployeeReports = canViewEmployeeProfile;
