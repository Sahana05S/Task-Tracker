'use client';

import * as React from 'react';
import {
  AlertCircleIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { deleteTaskLog } from '@/app/logs/actions';
import { QuickLogDrawer } from '@/components/logs/quick-log-drawer';
import { CategoryBadge } from '@/components/tracker/tracker-badges';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { groupLogsByDate } from '@/lib/logs/metrics';
import { formatDate, formatNumeric } from '@/lib/tracker/format';
import { cn } from '@/lib/utils';
import type { DailyTaskLog, Task } from '@/types/tracker';

export interface LogHistoryProps {
  logs: readonly DailyTaskLog[];
  /** Tasks referenced by the logs, for tag, title and category lookup. */
  tasks: readonly Task[];
}

/**
 * Personal effort history, grouped into descending date buckets.
 *
 * Each bucket carries its own hour and progress subtotal, which is the figure a
 * member checks when reconciling a day. Entries are editable and removable
 * inline, because this is the only place a mistyped entry can be corrected.
 */
export function LogHistory({ logs, tasks }: LogHistoryProps) {
  const [editingLog, setEditingLog] = React.useState<DailyTaskLog | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<DailyTaskLog | null>(
    null,
  );

  const taskById = React.useMemo(() => {
    const map = new Map<string, Task>();
    for (const task of tasks) map.set(task.id, task);
    return map;
  }, [tasks]);

  const groups = React.useMemo(() => groupLogsByDate(logs), [logs]);

  // Re-read from props so an open editor reflects a concurrent revalidation
  // rather than the snapshot captured on click.
  const activeEdit = editingLog
    ? (logs.find((log) => log.id === editingLog.id) ?? null)
    : null;

  return (
    <div className="flex flex-col gap-3">
      {/* Title, totals and the Log Hours action live in the page header. */}
      {groups.length === 0 ? (
        <div className="soft-card px-4 py-6">
          <p className="text-foreground text-sm font-semibold">
            No effort logged yet
          </p>
          <p className="text-muted-foreground mt-1 max-w-xl text-xs">
            Record hours against a task and the progress and productivity figures
            will follow automatically.
          </p>
        </div>
      ) : (
        <ol className="flex flex-col gap-4">
          {groups.map((group) => (
            <li key={group.logDate} className="flex flex-col gap-2">
              {/* Date heading, sticky so the day stays visible while scrolling a
                  long bucket, offset by the header's height. Only from `sm` up:
                  below that the header wraps to two rows and no fixed offset is
                  correct, and a heading parked behind the header is worse than one
                  that simply scrolls away. */}
              <div className="bg-background z-10 flex items-center gap-3 py-1.5 sm:sticky sm:top-(--spacing-header)">
                <h3 className="text-foreground text-sm font-bold">
                  {formatDate(group.logDate)}
                </h3>
                <span className="text-muted-foreground font-mono text-[11px] font-semibold tabular">
                  {formatNumeric(group.totalHours)} h
                </span>
                {group.totalProgressDelta !== 0 ? (
                  <span
                    className={cn(
                      'font-mono text-[11px] font-semibold tabular',
                      group.totalProgressDelta > 0
                        ? 'text-emerald-700'
                        : 'text-rose-700',
                    )}
                  >
                    {group.totalProgressDelta > 0 ? '+' : ''}
                    {group.totalProgressDelta}%
                  </span>
                ) : null}
                <span className="bg-border h-px flex-1" aria-hidden="true" />
              </div>

              <ul className="flex flex-col gap-2">
                {group.logs.map((log) => (
                  <li key={log.id}>
                    <LogEntry
                      log={log}
                      task={taskById.get(log.taskId) ?? null}
                      onEdit={() => setEditingLog(log)}
                      onRequestDelete={() => setPendingDelete(log)}
                    />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}

      {activeEdit ? (
        <QuickLogDrawer
          open
          onOpenChange={(open) => {
            if (!open) setEditingLog(null);
          }}
          log={activeEdit}
        />
      ) : null}

      <DeleteLogConfirmation
        log={pendingDelete}
        task={pendingDelete ? (taskById.get(pendingDelete.taskId) ?? null) : null}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Entry                                                                      */
/* -------------------------------------------------------------------------- */

interface LogEntryProps {
  log: DailyTaskLog;
  task: Task | null;
  onEdit: () => void;
  onRequestDelete: () => void;
}

function LogEntry({ log, task, onEdit, onRequestDelete }: LogEntryProps) {
  const delta = log.progressDelta ?? 0;

  return (
    <article className="soft-card flex flex-col gap-2 px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="task-tag">{task?.taskTag ?? 'Unknown task'}</span>
        {task ? <CategoryBadge category={task.category} /> : null}

        {/* Figures, not chips with glyphs: the unit suffix already says what the
            number is, so an icon beside it is redundant. */}
        <span className="ml-auto flex items-center gap-2.5 font-mono text-[11px] tabular">
          <span className="text-foreground font-semibold">
            {formatNumeric(log.hoursWorked)} h
          </span>
          {delta !== 0 ? (
            <span
              className={cn(
                'font-semibold',
                delta > 0 ? 'text-emerald-700' : 'text-rose-700',
              )}
            >
              {delta > 0 ? '+' : ''}
              {delta}%
            </span>
          ) : null}
        </span>
      </div>

      <p className="text-foreground text-[13px] font-medium">
        {task?.title ?? 'This task has been removed.'}
      </p>

      {log.updateNotes ? (
        <p className="text-sm whitespace-pre-line text-slate-600">
          {log.updateNotes}
        </p>
      ) : null}

      {log.rawLinks && log.rawLinks.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {log.rawLinks.map((link, index) => (
            <li key={`${link}-${index}`}>
              <a
                href={link}
                target="_blank"
                // noreferrer alongside noopener: the target page should not
                // receive this workspace URL as its referrer.
                rel="noopener noreferrer"
                className="badge-soft badge-neutral hover:bg-primary-subtle hover:text-primary max-w-64 transition-colors"
              >
                <ExternalLinkIcon className="size-3 shrink-0" aria-hidden="true" />
                <span className="truncate">{linkLabel(link)}</span>
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Text-only controls. "Edit" and "Delete" name themselves; a pencil and a
          bin beside them are decoration. */}
      <div className="border-border flex items-center gap-1 border-t pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onEdit}
          className="h-7 px-2"
        >
          Edit
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRequestDelete}
          className="h-7 px-2 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
        >
          Delete
        </Button>
      </div>
    </article>
  );
}

/**
 * Shortens a URL to host plus last path segment, which is what distinguishes one
 * drive file from another. Falls back to the raw string if it will not parse.
 */
function linkLabel(link: string): string {
  try {
    const url = new URL(link);
    const segments = url.pathname.split('/').filter(Boolean);
    const last = segments.at(-1);
    return last ? `${url.host}/${last}` : url.host;
  } catch {
    return link;
  }
}

/* -------------------------------------------------------------------------- */
/* Delete confirmation                                                        */
/* -------------------------------------------------------------------------- */

function DeleteLogConfirmation({
  log,
  task,
  onClose,
}: {
  log: DailyTaskLog | null;
  task: Task | null;
  onClose: () => void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (log) setError(null);
  }, [log]);

  const confirm = () => {
    if (!log) return;
    const hours = formatNumeric(log.hoursWorked);
    const tag = task?.taskTag ?? 'the task';

    startTransition(async () => {
      const result = await deleteTaskLog(log.id);
      if (result.success) {
        onClose();
        toast.success('Log entry deleted', {
          description: `${hours} hours removed from ${tag}, and its progress withdrawn.`,
        });
      } else {
        setError(result.error ?? 'Could not delete the log.');
      }
    });
  };

  return (
    <Sheet
      open={log !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <SheetContent side="bottom" className="sm:mx-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Delete log entry</SheetTitle>
          <SheetDescription>
            {log ? (
              <>
                {formatNumeric(log.hoursWorked)} hours on{' '}
                <span className="task-tag">{task?.taskTag ?? 'this task'}</span>{' '}
                will be removed
                {log.progressDelta ? (
                  <>
                    , and the {log.progressDelta}% it contributed will be taken
                    back off the task's progress
                  </>
                ) : null}
                .
              </>
            ) : null}
          </SheetDescription>
        </SheetHeader>

        {error ? (
          <div
            role="alert"
            className="mx-4 flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
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
              'Delete entry'
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
