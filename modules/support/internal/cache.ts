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

/** Meetings (migration 136): the list, a meeting's page, Today, mission pages and label pages. */
export function revalidateMeetings(meetingId?: string | null) {
  revalidatePath('/meeting-points');
  if (meetingId) revalidatePath(`/meeting-points/${meetingId}`);
  revalidatePath('/today');
  revalidatePath('/tasks/[taskTag]', 'page');
  revalidatePath('/labels/[slug]', 'page');
}
