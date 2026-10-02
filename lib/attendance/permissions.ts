import { canManageTasks } from '@/lib/tasks/permissions';
import type { AttendanceRecord, User } from '@/types/tracker';

export function canManageAttendance(role: User['role']): boolean {
  return canManageTasks(role);
}

export function canEditAttendanceRecord(
  user: Pick<User, 'id' | 'role'>,
  record: Pick<AttendanceRecord, 'userId'>,
): boolean {
  return canManageAttendance(user.role) || record.userId === user.id;
}
