import { revalidatePath } from 'next/cache';

/** Notes show on the checklist (row badges) and on label pages. PRIVATE. */
export function revalidateAfterNotes(): void {
  revalidatePath('/tasks/[taskTag]/checklist', 'page');
  revalidatePath('/labels/[slug]', 'page');
  revalidatePath('/labels');
}
