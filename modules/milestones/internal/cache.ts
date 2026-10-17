import { revalidatePath } from 'next/cache';

/** Both views read from these tables, and the drawer badge counts milestones. PRIVATE. */
export function revalidateMilestones(): void {
  revalidatePath('/milestones');
  // The open-milestone badge is rendered by the workspace layout.
  revalidatePath('/', 'layout');
}
