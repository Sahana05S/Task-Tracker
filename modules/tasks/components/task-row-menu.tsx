'use client';

import {
  ArchiveIcon,
  CheckCircle2Icon,
  CopyIcon,
  InfoIcon,
  PencilIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  Trash2Icon,
} from 'lucide-react';

import { operationsFor } from '@/modules/tasks/components/tools/operations';
import type { ToolOperation } from '@/modules/tasks/internal/tools/contract';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/shared/ui/dropdown-menu';
import type { Task } from '@/types/tracker';

/** What a row menu can ask the Missions shell to do. */
export interface TaskRowActions {
  onSummary: (task: Task) => void;
  onRun: (command: ToolOperation, task: Task) => void;
  onEdit: (task: Task) => void;
  onRequestDelete: (task: Task) => void;
}

export interface TaskRowMenuProps {
  task: Task;
  canManage: boolean;
  /** Manager, or an active assignee of this mission. */
  canEditOwnFields: boolean;
  actions: TaskRowActions;
}

/**
 * The items of a mission's row menu, shared by the table and the cards. Every
 * Task Tools action opens the operation drawer for this one mission, so it is
 * previewed before anything changes. Members get Done and Refresh on their own
 * missions; the rest is for managers.
 */
export function TaskRowMenuItems({
  task,
  canManage,
  canEditOwnFields,
  actions,
}: TaskRowMenuProps) {
  const onRun = (command: ToolOperation) => actions.onRun(command, task);
  const open = !task.archivedEffectiveDate;
  const canAct = open && canEditOwnFields;
  const manage = open && canManage;

  return (
    <>
      <DropdownMenuItem onSelect={() => actions.onSummary(task)}>
        <InfoIcon aria-hidden="true" />
        Quick summary
      </DropdownMenuItem>

      {canAct ? (
        <>
          <DropdownMenuSeparator />
          {task.status !== 'Done' ? (
            <DropdownMenuItem onSelect={() => onRun('bulk_done')}>
              <CheckCircle2Icon aria-hidden="true" />
              Mark done…
            </DropdownMenuItem>
          ) : null}
          {manage && task.status === 'Done' ? (
            <DropdownMenuItem onSelect={() => onRun('bulk_reopen')}>
              <RotateCcwIcon aria-hidden="true" />
              Reopen…
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => onRun('refresh')}>
            <RefreshCwIcon aria-hidden="true" />
            Refresh metrics…
          </DropdownMenuItem>
        </>
      ) : null}

      {manage ? (
        <>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <CopyIcon className="size-4" aria-hidden="true" />
              Copy
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {operationsFor(true, 'copy').map((operation) => (
                <DropdownMenuItem key={operation.command} onSelect={() => onRun(operation.command)}>
                  {operation.label}…
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem onSelect={() => onRun('archive')}>
            <ArchiveIcon aria-hidden="true" />
            Archive…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => actions.onEdit(task)}>
            <PencilIcon aria-hidden="true" />
            Edit details
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => actions.onRequestDelete(task)}>
            <Trash2Icon aria-hidden="true" />
            Delete mission
          </DropdownMenuItem>
        </>
      ) : null}
    </>
  );
}
