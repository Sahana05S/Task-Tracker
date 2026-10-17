import { revalidatePath } from 'next/cache';

export function revalidateSupportPaths() {
  for (const path of [
    '/reports',
    '/daily-facts',
    '/ideas',
    '/suggestions',
    '/sales',
    '/team',
  ]) {
    revalidatePath(path);
  }
}
