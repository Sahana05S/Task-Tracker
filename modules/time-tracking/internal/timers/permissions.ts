import { canManageTasks, isTaskWorker } from '@/modules/tasks/client';
import type { Task, User } from '@/types/tracker';

export function canStartTimerForTask(
  user: Pick<User, 'id' | 'role' | 'isActive'>,
  task: Pick<Task, 'assigneeId' | 'assigneeIds' | 'collaboratorIds' | 'status' | 'archivedEffectiveDate'>,
): boolean {
  // Collaborators and observers do not log time (D-A3, migration 108).
  return (
    user.isActive && !task.archivedEffectiveDate &&
    task.status !== 'Done' &&
    task.status !== 'Discarded' &&
    (canManageTasks(user.role) || isTaskWorker(task, user.id))
  );
}

export function canManageTimerRecord(
  user: Pick<User, 'id' | 'role' | 'isActive'>,
  timer: { readonly userId: string },
): boolean {
  return user.isActive && (canManageTasks(user.role) || timer.userId === user.id);
}
