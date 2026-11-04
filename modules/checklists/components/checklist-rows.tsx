import type { ActionResponse, Task } from '@/types/tracker';

/**
 * Shared command fields for checklist forms. Server-safe. (Completion is the
 * one-tap Yes / N/A `ObjectiveTick` in every view, Today included, since
 * 4 November 2026.) (The per-row timer controls were retired on 3 November 2026;
 * the mission timer is `TimerButton` in time-tracking.)
 */

/** The shared control look (`.field` in globals.css), full width. */
export const FIELD = 'field w-full';

export interface ChecklistContext {
  action: (form: FormData) => Promise<ActionResponse<unknown>>;
  task: Pick<Task, 'id' | 'taskTag' | 'lifecycleVersion'>;
  /** Not archived, Done or Discarded. */
  open: boolean;
}

/** Hidden identity fields every checklist command needs. */
export function CommandFields({ ctx, command }: { ctx: Pick<ChecklistContext, 'task'> & { checklistId?: string }; command: string }) {
  return (
    <>
      <input type="hidden" name="command" value={command} />
      {ctx.checklistId ? <input type="hidden" name="checklist_id" value={ctx.checklistId} /> : null}
      <input type="hidden" name="taskId" value={ctx.task.id} />
      <input type="hidden" name="expectedVersion" value={ctx.task.lifecycleVersion ?? 0} />
    </>
  );
}
