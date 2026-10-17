import { canManageTasks } from '@/modules/tasks';
import type { AttendanceRecord, User } from '@/types/tracker';

export function canManageAttendance(role: User['role']): boolean {
  return canManageTasks(role);
}

export function canEditAttendanceRecord(
  user: Pick<User, 'id' | 'role' | 'isActive'>,
  record: Pick<AttendanceRecord, 'userId'>,
): boolean {
  return user.isActive && (canManageAttendance(user.role) || record.userId === user.id);
}
