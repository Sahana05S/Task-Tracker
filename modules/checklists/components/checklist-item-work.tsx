'use client';

import * as React from 'react';

import { buttonVariants } from '@/shared/ui/button';
import { loadObjectiveReviews } from '@/modules/checklists/actions';
import type { ChecklistBranchRow } from '@/modules/checklists/client';
import type { ChecklistItemTime } from '@/modules/checklists/client';
import { formatHours } from '@/shared/tracker/format';
import type { ActionResponse, Task } from '@/types/tracker';
import { cn } from '@/shared/utils';
import type { ObjectiveReviews } from '../internal/review';
import { ObjectiveDetails, ObjectiveTick } from './objective-details';
import { ObjectiveReviewProvider } from './objective-review';

type Command = (form: FormData) => Promise<ActionResponse<unknown>>;
/**
 * One authoritative selected row. No entire checklist/detail tree is required.
 * It shows the same tick and details as the checklist views (review chip and
 * note, links, description, sub-mission tag, progress). Time is kept by the
 * mission timer (3 November 2026); the row shows the time logged against it
 * before per-row timers were retired.
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
  const [reviews, setReviews] = React.useState<ObjectiveReviews>();
  React.useEffect(() => {
    let current = true;
    // A failed read only leaves the review chip and note out.
    loadObjectiveReviews(task.id).then((result) => { if (current && result.success) setReviews(result.data); }).catch(() => undefined);
    return () => { current = false; };
  }, [task.id, node.id, node.completionState]);
  const { state } = actions;
  const action = React.useCallback<Command>(async (form) => {
    const result = await state(form);
    if (result.success) onCommitted();
    return result;
  }, [state, onCommitted]);
  const seconds = time?.secondsByNode.get(node.id);
  return (
    <ObjectiveReviewProvider taskId={task.id} version={task.lifecycleVersion ?? 0} action={actions.state} reviews={reviews}>
      <div className="mt-4 grid min-w-0 gap-4">
        <ObjectiveDetails row={node} />
        <dl className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <dt>Progress</dt><dd className="text-foreground text-right tabular-nums">{node.progressPercentage === null ? '—' : `${Math.round(node.progressPercentage)}%`}</dd>
          {!container && seconds ? <><dt>Logged on this objective</dt><dd className="text-right">{time?.available && seconds !== undefined ? `${formatHours(seconds / 3600)} h` : '—'}</dd></> : null}
        </dl>
        {container ? <><p className="text-muted-foreground text-sm">Progress is the average of the {node.childCount} row{node.childCount === 1 ? '' : 's'} under it.</p><button type="button" onClick={onOpen} className={cn(buttonVariants(), 'px-4')}>Open rows</button></> : <>
          <ObjectiveTick row={node} ctx={{ task, canEdit: true, version: task.lifecycleVersion ?? 0, action }} />
          <p className="text-muted-foreground text-xs">Tap Yes when it is done, N/A when it does not apply; tap the chosen one again to clear it. Time is kept by the mission’s timer.</p>
        </>}
      </div>
    </ObjectiveReviewProvider>
  );
}
