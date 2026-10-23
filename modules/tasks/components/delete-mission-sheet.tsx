'use client';

import * as React from 'react';
import { AlertCircleIcon, LoaderCircleIcon } from 'lucide-react';
import { toast } from 'sonner';

import { deleteTask } from '@/modules/tasks/actions';
import { Button } from '@/shared/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet';
import type { Task } from '@/types/tracker';

/* -------------------------------------------------------------------------- */
/* Delete confirmation                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Explicit confirmation before deletion.
 *
 * Deleting a task cascades to its `daily_task_logs` rows, so the logged effort
 * history goes with it. That is called out here because it is not recoverable
 * and not obvious.
 */
export function DeleteMissionSheet({
  task,
  onClose,
  onDeleted,
}: {
  task: Task | null;
  onClose: () => void;
  /** After a successful delete, e.g. leave the mission's own page. */
  onDeleted?: () => void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (task) setError(null);
  }, [task]);

  const confirm = () => {
    if (!task) return;
    const { taskTag } = task;

    startTransition(async () => {
      const result = await deleteTask(task.id);
      if (result.success) {
        onClose();
        onDeleted?.();
        // Reported by toast because the drawer that asked the question is gone by
        // the time the answer arrives.
        toast.success(`${taskTag} deleted`, {
          description: 'The mission and its effort logs have been removed.',
        });
      } else {
        // Kept inline: the drawer is still open and the message belongs next to
        // the action that was refused.
        setError(result.error ?? 'Could not delete the mission.');
      }
    });
  };

  return (
    <Sheet
      open={task !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <SheetContent side="bottom" className="sm:mx-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Delete mission</SheetTitle>
          <SheetDescription>
            {task ? (
              <>
                <span className="task-tag">{task.taskTag}</span> will be removed
                permanently, along with every effort log recorded against it.
              </>
            ) : null}
          </SheetDescription>
        </SheetHeader>

        {error ? (
          <div
            role="alert"
            className="mx-4 flex items-start gap-2 rounded-md border border-danger-border bg-danger-subtle px-3 py-2 text-sm text-danger"
          >
            <AlertCircleIcon
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>{error}</span>
          </div>
        ) : null}

        <SheetFooter className="flex-row justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={confirm}
            disabled={pending}
          >
            {pending ? (
              <>
                <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
                Deleting
              </>
            ) : (
              'Delete permanently'
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
