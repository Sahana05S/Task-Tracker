import { buttonVariants } from '@/shared/ui/button';
import type { ChecklistBranchRow } from '@/modules/checklists/client';
import type { ChecklistItemTime } from '@/modules/checklists/client';
import { CompletionForm } from './checklist-rows';
import { formatHours } from '@/shared/tracker/format';
import type { ActionResponse, Task } from '@/types/tracker';
import { cn } from '@/shared/utils';

type Command = (form: FormData) => Promise<ActionResponse<unknown>>;
/**
 * One authoritative selected row. No entire checklist/detail tree is required.
 * Time is kept by the mission timer (3 November 2026); the row shows the time
 * logged against it before per-row timers were retired.
 */
export function ChecklistItemWork({ task, node, time, actions, onOpen, onCommitted }: {
  task: Pick<Task, 'id' | 'taskTag' | 'lifecycleVersion'>;
  node: ChecklistBranchRow;
  time?: ChecklistItemTime;
  actions: { state: Command };
  onOpen: () => void;
  onCommitted: () => void;
}) {
  const container = node.childCount > 0;
  const wrap = (action: Command): Command => async form => {
    form.set('checklist_id', node.checklistId);
    const result = await action(form);
    if (result.success) onCommitted();
    return result;
  };
  const seconds = time?.secondsByNode.get(node.id);
  return <div className="mt-4 grid min-w-0 gap-4">
    {node.description ? <p className="text-muted-foreground whitespace-pre-wrap break-words text-sm leading-relaxed">{node.description}</p> : null}
    <dl className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
      <dt>Progress</dt><dd className="text-foreground text-right tabular-nums">{node.progressPercentage === null ? '—' : `${Math.round(node.progressPercentage)}%`}</dd>
      {!container && seconds ? <><dt>Logged on this objective</dt><dd className="text-right">{time?.available && seconds !== undefined ? `${formatHours(seconds / 3600)} h` : '—'}</dd></> : null}
    </dl>
    {node.links.length ? <ul className="grid gap-2 text-sm">{node.links.map((href, index) => <li key={`${href}:${index}`}><a href={href} target="_blank" rel="noopener noreferrer" className="text-primary break-all underline underline-offset-4">Work link {index + 1}</a></li>)}</ul> : null}
    {container ? <><p className="text-muted-foreground text-sm">Progress is the average of the {node.childCount} row{node.childCount === 1 ? '' : 's'} under it.</p><button type="button" onClick={onOpen} className={cn(buttonVariants(), 'px-4')}>Open rows</button></> : <>
      <CompletionForm ctx={{ action: wrap(actions.state), task, checklistId: node.checklistId }} node={node} className="grid gap-2" />
      <p className="text-muted-foreground text-xs">Time is kept by the mission’s timer.</p>
    </>}
  </div>;
}
