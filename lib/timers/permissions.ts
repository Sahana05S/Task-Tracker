import { canManageTasks, isAssignedToTask } from '@/lib/tasks/permissions';
import type { Task, User } from '@/types/tracker';

export function canStartTimerForTask(
  user: Pick<User, 'id' | 'role' | 'isActive'>,
  task: Pick<Task, 'assigneeId' | 'assigneeIds' | 'status' | 'archivedEffectiveDate'>,
): boolean {
  return (
    user.isActive && !task.archivedEffectiveDate &&
    task.status !== 'Done' &&
    task.status !== 'Discarded' &&
    (canManageTasks(user.role) || isAssignedToTask(task, user.id))
  );
}

export function canManageTimerRecord(
  user: Pick<User, 'id' | 'role' | 'isActive'>,
  timer: { readonly userId: string },
): boolean {
  return user.isActive && (canManageTasks(user.role) || timer.userId === user.id);
}
