import { revalidatePath } from 'next/cache';

/** Logged hours feed tasks, logs, dashboard, team and reports. PRIVATE. */

export function revalidateAfterLog(taskTag: string): void {
  for (const path of ['/logs', '/tasks', '/dashboard', '/team', '/reports', `/tasks/${encodeURIComponent(taskTag)}`]) {
    revalidatePath(path);
  }
  revalidatePath('/team/[employeeId]', 'page');
}

export function revalidateAfterTimer(taskTag: string): void {
  for (const path of [`/tasks/${encodeURIComponent(taskTag)}`, '/tasks', '/logs', '/dashboard', '/team', '/task-tools', '/reports']) {
    revalidatePath(path);
  }
  revalidatePath('/team/[employeeId]', 'page');
  revalidatePath('/tasks/[taskTag]/checklist', 'page');
  revalidatePath('/tasks/[taskTag]/checklist/manage', 'page');
  revalidatePath('/tasks/[taskTag]/checklist/[nodeId]', 'page');
}
