import { TASK_MANAGER_ROLES } from '@/lib/tracker/enums';
import type { Task, User, UserRole } from '@/types/tracker';

export function canManageTasks(role: UserRole): boolean {
  return (TASK_MANAGER_ROLES as readonly UserRole[]).includes(role);
}

export function isAssignedToTask(
  task: Pick<Task, 'assigneeId' | 'assigneeIds'>,
  userId: string,
): boolean {
  return task.assigneeId === userId || task.assigneeIds.includes(userId);
}

export function canUpdateTaskOwnFields(
  user: Pick<User, 'id' | 'role' | 'isActive'>,
  task: Pick<Task, 'assigneeId' | 'assigneeIds' | 'archivedEffectiveDate'>,
): boolean {
  return !task.archivedEffectiveDate && user.isActive && (canManageTasks(user.role) || isAssignedToTask(task, user.id));
}
