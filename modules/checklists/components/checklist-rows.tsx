import { ExecutionForm } from '@/shared/ui/execution-form';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/utils';
import type { ActionResponse, ChecklistNode, Task } from '@/types/tracker';

/**
 * Completion controls shared by the checklist tables and the Today roadmap.
 * Server-safe. (The per-row timer controls were retired on 3 November 2026;
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

/** Yes / No / N/A for a leaf; linked real tasks only toggle applicability. */
export function CompletionForm({ ctx, node, className }: { ctx: Pick<ChecklistContext, 'task' | 'action'> & { checklistId?: string }; node: ChecklistNode; className?: string }) {
  return (
    <ExecutionForm action={ctx.action} scope={`state:${node.id}`} className={className}>
      <CommandFields ctx={ctx} command="state" />
      <input type="hidden" name="node_id" value={node.id} />
      <div className="flex min-w-0 flex-wrap items-end gap-2">
        <label className="grid min-w-0 flex-1 gap-1 text-xs sm:flex-none">
          <span className="text-muted-foreground font-medium">Completion</span>
          {/* Keyed on the saved state so the post-save form reset shows the new value. */}
          <select key={node.completionState ?? 'No'} name="state" defaultValue={node.completionState ?? 'No'} className={cn(FIELD, 'h-9 sm:w-28')}>
            {(node.linkedTaskId ? ['No', 'N/A'] : ['Yes', 'No', 'N/A']).map(s => <option key={s}>{s}</option>)}
          </select>
        </label>
        <Button type="submit" size="sm" className="h-9">Save state</Button>
      </div>
      {node.linkedTaskId ? <p className="text-muted-foreground max-w-60 text-xs">No restores applicability; completion follows the linked task.</p> : null}
    </ExecutionForm>
  );
}
