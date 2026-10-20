import { buttonVariants } from '@/shared/ui/button';
import type { ChecklistBranchRow } from '@/modules/checklists/client';
import { formatMinutes, type ChecklistItemTime } from '@/modules/checklists/client';
import { CompletionForm, ItemTimerControls } from './checklist-rows';
import { formatHours } from '@/shared/tracker/format';
import type { ActionResponse, Task } from '@/types/tracker';
import { cn } from '@/shared/utils';

type Command = (form: FormData) => Promise<ActionResponse<unknown>>;
/** One authoritative selected row. No entire checklist/detail tree is required. */
export function ChecklistItemWork({ task, node, time, actions, onOpen, onCommitted }: {
  task: Pick<Task, 'id' | 'taskTag' | 'lifecycleVersion'>;
  node: ChecklistBranchRow;
  time?: ChecklistItemTime;
  actions: { state: Command; start: Command; stop: Command; discard: Command };
  onOpen: () => void;
  onCommitted: () => void;
}) {
  const container = node.isSubMission || node.childCount > 0 || ['Page', 'Group'].includes(node.nodeType);
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
      <dt>Progress</dt><dd className="text-foreground text-right tabular-nums">{node.progressPercentage === null ? 'Unavailable' : `${Math.round(node.progressPercentage)}%`}</dd>
      <dt>Estimate</dt><dd className="text-right">{formatMinutes(node.estimatedMinutes) ?? 'Not estimated'}</dd>
      {!container ? <><dt>Logged on this item</dt><dd className="text-right">{time?.available && seconds !== undefined ? `${formatHours(seconds / 3600)} h` : 'Unavailable'}</dd></> : null}
    </dl>
    {node.links.length ? <ul className="grid gap-2 text-sm">{node.links.map((href, index) => <li key={`${href}:${index}`}><a href={href} target="_blank" rel="noopener noreferrer" className="text-primary break-all underline underline-offset-4">Work link {index + 1}</a></li>)}</ul> : null}
    {container ? <><p className="text-muted-foreground text-sm">{node.isSubMission ? 'This Sub-mission inherits the mission owners and deadline. Its checklist controls progress and completion.' : 'Progress follows the items inside this checklist.'}</p><button type="button" onClick={onOpen} className={cn(buttonVariants(), 'px-4')}>Open checklist</button></> : <>
      <CompletionForm ctx={{ action: wrap(actions.state), task, checklistId: node.checklistId }} node={node} className="grid gap-2" />
      {time ? <ItemTimerControls ctx={{ task, open: true, time: { info: time, canStart: true, start: wrap(actions.start), stop: wrap(actions.stop), discard: wrap(actions.discard) } }} node={node} /> : <p role="status" className="text-muted-foreground text-xs">Loading item time…</p>}
      {time && !time.available ? <p className="text-muted-foreground text-xs">Item time is unavailable until the checklist read migration is installed.</p> : null}
    </>}
  </div>;
}
