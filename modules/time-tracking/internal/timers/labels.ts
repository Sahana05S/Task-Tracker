/** "TAG › Quest" for a Quest timer, the tag alone for a mission timer (migration 123). Client-safe. */
export function runningTimerLabel(timer: { readonly taskTag: string; readonly questTitle?: string | null }): string {
  return timer.questTitle ? `${timer.taskTag} › ${timer.questTitle}` : timer.taskTag;
}
