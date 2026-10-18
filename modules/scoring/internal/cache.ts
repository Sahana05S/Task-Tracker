import { revalidatePath } from 'next/cache';

/** Daily star results show on the team and dashboard pages. PRIVATE. */
export function revalidateDailyStarViews(): void {
  revalidatePath('/team');
  revalidatePath('/dashboard');
}
