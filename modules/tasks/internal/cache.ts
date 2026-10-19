import { revalidatePath } from 'next/cache';

/** Which pages to refresh after each kind of task change. PRIVATE. */

export function revalidateAfterCreate(): void {
  revalidatePath('/tasks');
  revalidatePath('/dashboard');
  revalidatePath('/task-tools');
}

export function revalidateAfterEdit(): void {
  revalidatePath('/tasks');
  revalidatePath('/dashboard');
}

export function revalidateAfterLifecycle(): void {
  revalidatePath('/tasks');
  revalidatePath('/tasks', 'layout');
  revalidatePath('/dashboard');
  revalidatePath('/task-tools');
}

export function revalidateAfterDetails(): void {
  revalidatePath('/tasks');
  revalidatePath('/task-tools');
  revalidatePath('/tasks/[taskTag]', 'page');
  revalidatePath('/tasks/[taskTag]/checklist', 'page');
  revalidatePath('/tasks/[taskTag]/checklist/manage', 'page');
}

export function revalidateAfterTemplate(): void {
  revalidatePath('/task-tools');
  revalidatePath('/tasks');
}

export function revalidateAfterToolCommit(): void {
  for (const path of ['/task-tools', '/tasks', '/dashboard', '/team', '/support', '/reports']) revalidatePath(path);
}
