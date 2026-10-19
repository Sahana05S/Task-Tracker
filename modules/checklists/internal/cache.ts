import { revalidatePath } from 'next/cache';

/** Checklist progress feeds tasks, Task Tools, the dashboard and team views. PRIVATE. */
export function revalidateAfterChecklistChange(): void {
  revalidatePath('/today');
  revalidatePath('/tasks');
  revalidatePath('/task-tools');
  revalidatePath('/tasks/[taskTag]', 'page');
  revalidatePath('/tasks/[taskTag]/checklist', 'page');
  revalidatePath('/tasks/[taskTag]/checklist/manage', 'page');
  revalidatePath('/tasks/[taskTag]/checklist/[nodeId]', 'page');
  revalidatePath('/dashboard');
  revalidatePath('/team');
}
