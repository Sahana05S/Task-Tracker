'use client';

import * as React from 'react';
import { LoaderCircleIcon } from 'lucide-react';
import { toast } from 'sonner';

import { updateTaskStatus } from '@/app/tasks/actions';
import { StatusBadge } from '@/components/tracker/tracker-badges';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { TASK_STATUSES } from '@/lib/tracker/enums';
import { cn } from '@/lib/utils';
import type { TaskStatus } from '@/types/tracker';

export interface StatusSelectProps {
  taskId: string;
  taskTag: string;
  status: TaskStatus;
  /** False renders a read-only badge instead of a picker. */
  canEdit: boolean;
  className?: string;
}

/**
 * Inline status picker.
 *
 * Applies the new status locally before the Server Action resolves, so the badge
 * changes on click, and rolls back to the previous value if the write is
 * refused. That covers the "instant feedback" requirement in tech-stack.md
 * without pretending a rejected change succeeded.
 *
 * Failures are reported by toast rather than inline. A grid cell has no room for
 * a sentence, and the visible rollback of the badge is already the persistent
 * signal that nothing was saved — the toast supplies the reason.
 */
export function StatusSelect({
  taskId,
  taskTag,
  status,
  canEdit,
  className,
}: StatusSelectProps) {
  const [value, setValue] = React.useState<TaskStatus>(status);
  const [pending, startTransition] = React.useTransition();

  // Re-sync when the server sends a new value, so a revalidation or an edit made
  // elsewhere is not masked by stale local state.
  React.useEffect(() => {
    setValue(status);
  }, [status]);

  if (!canEdit) {
    return <StatusBadge status={value} className={className} />;
  }

  const handleChange = (next: string) => {
    const candidate = TASK_STATUSES.find((entry) => entry === next);
    if (!candidate || candidate === value) return;

    const previous = value;
    setValue(candidate);

    startTransition(async () => {
      const result = await updateTaskStatus(taskId, candidate);
      if (!result.success) {
        setValue(previous);
        toast.error(`${taskTag} status not saved`, {
          description: result.error ?? 'Could not update status.',
        });
      }
    });
  };

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <Select value={value} onValueChange={handleChange} disabled={pending}>
        <SelectTrigger
          size="sm"
          aria-label={`Status for ${taskTag}`}
          className="w-auto min-w-28 border-transparent bg-transparent px-1 hover:bg-slate-100"
        >
          <StatusBadge status={value} />
        </SelectTrigger>
        <SelectContent>
          {TASK_STATUSES.map((entry) => (
            <SelectItem key={entry} value={entry}>
              <StatusBadge status={entry} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {pending ? (
        <LoaderCircleIcon
          className="size-3.5 shrink-0 animate-spin text-slate-400"
          aria-label="Saving"
        />
      ) : null}
    </div>
  );
}
