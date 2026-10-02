import { canManageTasks, isAssignedToTask } from '@/lib/tasks/permissions';
import type { Task, User } from '@/types/tracker';

export function canStartTimerForTask(
  user: Pick<User, 'id' | 'role'>,
  task: Pick<Task, 'assigneeId' | 'assigneeIds' | 'status'>,
): boolean {
  return (
    task.status !== 'Done' &&
    task.status !== 'Discarded' &&
    (canManageTasks(user.role) || isAssignedToTask(task, user.id))
  );
}

export function canManageTimerRecord(
  user: Pick<User, 'id' | 'role'>,
  timer: { readonly userId: string },
): boolean {
  return canManageTasks(user.role) || timer.userId === user.id;
}
