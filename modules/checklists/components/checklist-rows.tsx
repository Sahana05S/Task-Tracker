import { PlayIcon, SquareIcon, TimerIcon } from 'lucide-react';

import { RunningClock } from '@/shared/ui/running-clock';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { Button } from '@/shared/ui/button';
import type { ChecklistItemTime } from '@/modules/checklists/internal/item-time';
import { cn } from '@/shared/utils';
import type { ActionResponse, ChecklistNode, Task } from '@/types/tracker';

/**
 * Item timer and completion controls shared by the checklist tables and the
 * Today roadmap. Server-safe.
 */

/** The shared control look (`.field` in globals.css), full width. */
export const FIELD = 'field w-full';

export interface ChecklistContext {
  action: (form: FormData) => Promise<ActionResponse<unknown>>;
  task: Pick<Task, 'id' | 'taskTag' | 'lifecycleVersion'>;
  /** Not archived, Done or Discarded. */
  open: boolean;
  /** Item timers (migration 34): logged time, running timers and the actions. */
  time?: {
    info: ChecklistItemTime;
    /** The signed-in user may start timers on this task. */
    canStart: boolean;
    start: (form: FormData) => Promise<ActionResponse<unknown>>;
    stop: (form: FormData) => Promise<ActionResponse<unknown>>;
    discard: (form: FormData) => Promise<ActionResponse<unknown>>;
  };
}

/**
 * Start / stop / discard a timer on one checklist item. Stopping writes an
 * ordinary task log tagged with the item, so the time counts as task hours.
 */
export function ItemTimerControls({ ctx, node, compact }: { ctx: Pick<ChecklistContext, 'time' | 'task' | 'open'>; node: ChecklistNode; compact?: boolean }) {
  const time = ctx.time;
  if (!time?.info.available) return null;
  const mine = time.info.mine;
  const mineHere = mine && mine.nodeId === node.id && mine.taskId === ctx.task.id ? mine : null;
  const someoneElse = !mineHere ? time.info.runningByNode.get(node.id) : undefined;
  if (mineHere) {
    return (
      <div className={cn('grid min-w-0 gap-2', compact && 'justify-items-end')}>
        <p className="text-recognition-foreground bg-recognition-subtle inline-flex items-center gap-1.5 justify-self-start rounded-full px-2.5 py-1 text-xs font-semibold">
          <TimerIcon className="size-3.5" aria-hidden="true" />
          Timer running <RunningClock startedAt={mineHere.startedAt} />
        </p>
        <ExecutionForm action={time.stop} scope={`itemTimerStop:${mineHere.timerId}`} className="grid min-w-0 gap-2">
          <input type="hidden" name="timerId" value={mineHere.timerId} />
          <input type="hidden" name="expectedVersion" value={mineHere.version} />
          {compact ? null : <textarea name="notes" placeholder="What did you do? (saved on the task log)" aria-label="Timer notes" className={cn(FIELD, 'min-h-16 py-2')} />}
          <Button type="submit" size="sm" className="h-9 justify-self-start"><SquareIcon aria-hidden="true" />Stop and log time</Button>
        </ExecutionForm>
        {compact ? null : (
          <ExecutionForm action={time.discard} scope={`itemTimerDiscard:${mineHere.timerId}`} className="grid min-w-0 gap-2">
            <input type="hidden" name="timerId" value={mineHere.timerId} />
            <input type="hidden" name="expectedVersion" value={mineHere.version} />
            <input type="hidden" name="taskTag" value={ctx.task.taskTag} />
            <input name="reason" required placeholder="Reason for discarding" aria-label="Reason for discarding" className={cn(FIELD, 'h-9')} />
            <Button type="submit" variant="ghost" size="sm" className="justify-self-start">Discard timer</Button>
          </ExecutionForm>
        )}
      </div>
    );
  }
  if (someoneElse) {
    return (
      <p className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
        <TimerIcon className="size-3.5" aria-hidden="true" />A teammate's timer is running here
      </p>
    );
  }
  if (!time.canStart || !ctx.open) return null;
  if (mine) {
    return compact ? null : <p className="text-muted-foreground text-xs">Your timer is already running elsewhere. Stop it before timing this item.</p>;
  }
  return (
    <ExecutionForm action={time.start} scope={`itemTimerStart:${node.id}`} className="grid min-w-0 gap-2">
      <input type="hidden" name="nodeId" value={node.id} />
      {compact ? null : <textarea name="notes" placeholder="Optional note for the log" aria-label="Timer notes" className={cn(FIELD, 'min-h-16 py-2')} />}
      <Button type="submit" variant={compact ? 'outline' : 'default'} size="sm" className="h-9 justify-self-start"><PlayIcon aria-hidden="true" />Start timer</Button>
    </ExecutionForm>
  );
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
