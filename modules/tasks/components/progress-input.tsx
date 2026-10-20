'use client';
import { prepareOperation } from '@/shared/commands/client-operation';

import * as React from 'react';
import { LoaderCircleIcon } from 'lucide-react';
import { toast } from 'sonner';

import { updateTaskProgress } from '@/modules/tasks/actions';
import { toProgressValue } from '@/shared/tracker/format';
import { cn } from '@/shared/utils';
import { UnavailableValue } from '@/shared/ui/unavailable-value';

export interface ProgressInputProps {
  taskId: string;
  version?: number;
  taskTag: string;
  progressPercentage: number | null;
  progressOwner?: 'manual'|'checklist';
  /** False renders the value as static text. */
  canEdit: boolean;
  className?: string;
}

/** Empty string when unset, so the field shows blank rather than a fake zero. */
function toFieldValue(progress: number | null): string {
  return progress === null ? '' : String(progress);
}

/**
 * Inline progress editor.
 *
 * Commits on blur or Enter rather than on every keystroke, so typing "100" does
 * not fire writes for 1 and 10 on the way. Escape abandons the edit.
 *
 * Only `progress_percentage` is sent. `scaled_progress` is a generated column,
 * so the recomputed value arrives with the next revalidation.
 *
 * Rejections are reported by toast, since a grid cell cannot hold a sentence. The
 * field keeps `aria-invalid` so the invalid state persists visually and for
 * assistive technology after the toast has gone.
 */
export function ProgressInput({
  taskId,
  version,
  taskTag,
  progressPercentage,
  progressOwner,
  canEdit,
  className,
}: ProgressInputProps) {
  const [committed, setCommitted] = React.useState<number | null>(
    progressPercentage,
  );
  const [draft, setDraft] = React.useState<string>(
    toFieldValue(progressPercentage),
  );
  const [invalid, setInvalid] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const reject = (message: string) => {
    setInvalid(true);
    toast.error(`${taskTag} progress not saved`, { description: message });
  };

  React.useEffect(() => {
    setCommitted(progressPercentage);
    setDraft(toFieldValue(progressPercentage));
  }, [progressPercentage]);

  const barValue = toProgressValue(committed);

  if (!canEdit) {
    return (
      <div className={cn('flex flex-col gap-1', className)}>
        <span className="sheet-numeric text-foreground text-xs">
          {committed === null ? <UnavailableValue reason="no progress recorded" /> : `${committed}%`}{progressOwner==='checklist'?' · Activity':''}
        </span>
        <progress
          className="task-progress"
          value={barValue}
          max={100}
          aria-label={`Progress for ${taskTag}`}
        />
      </div>
    );
  }

  const commit = () => {
    const trimmed = draft.trim();

    // Blank means "leave it alone". Clearing to NULL is a different intent and
    // belongs in the edit form, not in a grid cell.
    if (trimmed === '') {
      setDraft(toFieldValue(committed));
      return;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setDraft(toFieldValue(committed));
      reject('Progress must be a number.');
      return;
    }

    const rounded = Math.round(parsed * 100) / 100;

    if (rounded < 0 || rounded > 100) {
      setDraft(toFieldValue(committed));
      reject('Progress must be between 0 and 100.');
      return;
    }
    if (rounded === committed) {
      setDraft(toFieldValue(committed));
      return;
    }

    const previous = committed;
    setCommitted(rounded);
    setDraft(String(rounded));
    setInvalid(false);

    startTransition(async () => {
      const form=new FormData(); form.set('taskId',taskId); form.set('command','progress'); form.set('value',String(rounded)); form.set('expectedVersion',String(version ?? 0));
      let result;
      try {
        const finish=await prepareOperation(form,'progress');
        result=await updateTaskProgress(taskId,rounded,Number(form.get('expectedVersion')),String(form.get('operationId')));
        if (result.success) finish();
      } catch { result={success:false,error:'Response unavailable. Retry the same change to recover its result.'}; }
      if (!result.success) {
        setCommitted(previous);
        setDraft(toFieldValue(previous));
        reject(result.error ?? 'Could not update progress.');
      }
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setDraft(toFieldValue(committed));
      setInvalid(false);
    }
  };

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center gap-1">
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step={1}
          value={draft}
          disabled={pending}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          aria-label={`Progress percentage for ${taskTag}`}
          aria-invalid={invalid}
          className={cn(
            'text-foreground w-14 rounded-lg border border-transparent bg-transparent px-1.5 py-0.5 text-right text-xs tabular',
            'hover:border-input hover:bg-white',
            'focus-visible:border-primary focus-visible:ring-primary/20 focus-visible:bg-white focus-visible:ring-2 focus-visible:outline-none',
            'disabled:text-slate-400',
            // Spin buttons steal width the dense grid cannot spare.
            '[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
            invalid && 'border-danger',
          )}
        />
        <span className="text-xs text-slate-400" aria-hidden="true">
          %
        </span>

        {pending ? (
          <LoaderCircleIcon
            className="text-muted-foreground size-3.5 shrink-0 animate-spin"
            aria-label="Saving"
          />
        ) : null}
      </div>

      <progress
        className="task-progress"
        value={barValue}
        max={100}
        aria-hidden="true"
      />
    </div>
  );
}
