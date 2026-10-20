'use client';
import { prepareOperation } from '@/shared/commands/client-operation';

import * as React from 'react';
import {
  LinkIcon,
  LoaderCircleIcon,
  PlusIcon,
  XIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import {
  createTaskLog,
  loadLoggableTasks,
  updateTaskLog,
  type LoggableTaskOption,
  type LogActionState,
} from '@/modules/time-tracking/actions';
import { Button } from '@/shared/ui/button';
import { Field, FormError } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/shared/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet';
import { Textarea } from '@/shared/ui/textarea';
import {
  applyProgressDelta,
  computeScaledProgress,
} from '@/modules/time-tracking/internal/logs/metrics';
import { formatNumeric } from '@/shared/tracker/format';
import type { DailyTaskLog } from '@/types/tracker';

export interface QuickLogDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preselects the picker, e.g. when opened from a task card. */
  presetTaskId?: string;
  /** Supplied to edit an existing entry; omitted to create a new one. */
  log?: DailyTaskLog | null;
}

const INITIAL_STATE: LogActionState | null = null;

/** Today in the browser's timezone, which is what the user means by "today". */
function localTodayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Daily effort logger.
 *
 * Anchored to the bottom edge so it reads as the full-screen drawer the mobile
 * spec calls for, and constrained on wider screens so it behaves as a dialog.
 *
 * The task list is fetched when the drawer opens rather than passed down, since
 * the global FAB that opens it is mounted on every workspace page and would
 * otherwise cost a query per navigation.
 */
export function QuickLogDrawer({
  open,
  onOpenChange,
  presetTaskId,
  log = null,
}: QuickLogDrawerProps) {
  const isEdit = log !== null;

  const [createState, createAction, createPending] = React.useActionState(
    async (previous: LogActionState|null, form: FormData) => {
      try { const confirmed=await prepareOperation(form,'createTaskLog'); const result=await createTaskLog(previous,form); if(result.success) confirmed(); return result; }
      catch { return {success:false,error:'Response interrupted. Retry the same values to recover the saved result.'}; }
    },
    INITIAL_STATE,
  );
  const [editState, editAction, editPending] = React.useActionState(
    async (previous: LogActionState|null, form: FormData) => {
      try { const confirmed=await prepareOperation(form,'updateTaskLog'); const result=await updateTaskLog(previous,form); if(result.success) confirmed(); return result; }
      catch { return {success:false,error:'Response interrupted. Retry the same values to recover the saved result.'}; }
    },
    INITIAL_STATE,
  );

  const state = isEdit ? editState : createState;
  const pending = isEdit ? editPending : createPending;
  const actionError = state && !state.success ? state.error : undefined;

  const [options, setOptions] = React.useState<LoggableTaskOption[]>([]);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  // Fetch once per opening. Reloading on every render would fire on each
  // keystroke that updates this component's state.
  React.useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    void loadLoggableTasks().then((result) => {
      if (cancelled) return;
      if (result.success && result.data) {
        setOptions(result.data);
      } else {
        setLoadError(result.error ?? 'Could not load your tasks.');
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const handledResult=React.useRef<LogActionState|null>(null);
  const succeeded = state?.success === true;
  React.useEffect(() => {
    if (succeeded && open && handledResult.current !== state) {
      handledResult.current=state;
      onOpenChange(false);
      // The drawer closes on success, so the confirmation has to live outside it.
      toast.success(isEdit ? 'Log entry updated' : 'Hours logged', {
        description:
          'Task progress and productivity have been recalculated.',
      });
    }
  }, [succeeded, open, onOpenChange, isEdit, state]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] gap-0 sm:mx-auto sm:max-w-xl sm:rounded-t-xl"
      >
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit log entry' : 'Log hours'}</SheetTitle>
          <SheetDescription>
            Record time and the progress it produced. The task's productivity
            rate updates automatically.
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
            <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" />
            Loading your tasks
          </div>
        ) : loadError ? (
          <FormError message={loadError} className="mx-4 my-4" />
        ) : (
          <LogForm
            // Remount for a different entry so field state does not carry over.
            key={log?.id ?? presetTaskId ?? 'create'}
            options={options}
            log={log}
            presetTaskId={presetTaskId}
            action={isEdit ? editAction : createAction}
            pending={pending}
            error={actionError}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* Form                                                                       */
/* -------------------------------------------------------------------------- */

interface LogFormProps {
  options: readonly LoggableTaskOption[];
  log: DailyTaskLog | null;
  presetTaskId?: string;
  action: (formData: FormData) => void;
  pending: boolean;
  error?: string;
  onCancel: () => void;
}

function LogForm({
  options,
  log,
  presetTaskId,
  action,
  pending,
  error,
  onCancel,
}: LogFormProps) {
  const isEdit = log !== null;

  const initialTaskId =
    log?.taskId ?? presetTaskId ?? options[0]?.id ?? '';

  const [taskId, setTaskId] = React.useState(initialTaskId);
  const [hours, setHours] = React.useState(
    log ? String(log.hoursWorked) : '',
  );
  const [delta, setDelta] = React.useState(
    log && (log.requestedProgressDelta ?? log.progressDelta) != null
      ? String(log.requestedProgressDelta ?? log.progressDelta) : '',
  );
  const [links, setLinks] = React.useState<string[]>(
    log?.rawLinks && log.rawLinks.length > 0 ? [...log.rawLinks] : [''],
  );

  const selected = options.find((option) => option.id === taskId) ?? null;

  const parsedDelta = Number(delta);
  const deltaIsNumber = delta.trim() !== '' && Number.isFinite(parsedDelta);

  // Preview the outcome so the delta is not a guess. Mirrors the same helpers
  // the Server Action uses, so the number shown is the number that will land.
  const currentProgress = selected?.progressPercentage ?? null;
  const nextProgress = !deltaIsNumber ? null : isEdit
    ? parsedDelta === (log?.requestedProgressDelta ?? log?.progressDelta) ? currentProgress
      : log?.effectiveProgressDelta == null ? null
      : applyProgressDelta(currentProgress, parsedDelta-log.effectiveProgressDelta)
    : applyProgressDelta(currentProgress, parsedDelta);
  const nextScaled =
    nextProgress === null
      ? null
      : computeScaledProgress(selected?.taskScale ?? null, nextProgress);

  const noTasks = options.length === 0;

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      {isEdit ? <><input type="hidden" name="taskId" value={log.taskId} /><input type="hidden" name="logId" value={log.id} /><input type="hidden" name="expectedVersion" value={log.executionVersion ?? 0} />
      <label className="grid gap-1 px-4 pt-3 text-sm">Correction reason<input name="reason" required maxLength={1000} className="border rounded px-2 py-1" /></label></> : null}

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
        {noTasks ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            You have no open tasks assigned. Effort can only be logged against
            tasks assigned to you that are not Done or Discarded.
          </p>
        ) : null}

        <Field id="log-task" label="Task" required>
          <Select
            name="taskId"
            value={taskId}
            onValueChange={setTaskId}
            disabled={noTasks || isEdit}
            required
          >
            <SelectTrigger id="log-task">
              {selected ? `${selected.taskTag} · ${selected.title}` : 'Select a task'}
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.taskTag} · {option.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="log-date" label="Log date" required>
            <Input
              id="log-date"
              name="logDate"
              type="date"
              defaultValue={log?.logDate ?? localTodayIso()}
              max={localTodayIso()}
              required
            />
          </Field>

          <Field
            id="log-hours"
            label="Hours worked"
            hint="Quarter-hour steps. Maximum 24 per entry."
            required
          >
            <Input
              id="log-hours"
              name="hoursWorked"
              type="number"
              min={0}
              max={24}
              step="0.25"
              inputMode="decimal"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              placeholder="0.00"
              required
              className="tabular"
            />
          </Field>
        </div>

        <Field
          id="log-delta"
          label="Progress requested"
          hint="Percentage points to add to the task's current progress. Negative values correct an overstatement."
        >
          <Input
            id="log-delta"
            name="progressDelta"
            type="number"
            min={-100}
            max={100}
            step="0.5"
            inputMode="decimal"
            value={delta}
            onChange={(event) => setDelta(event.target.value)}
            placeholder="0"
            className="tabular"
          />
        </Field>

        {selected && nextProgress !== null ? (
          <p className="soft-inset text-muted-foreground px-3.5 py-2.5 text-xs">
            Progress moves from{' '}
            <span className="text-foreground font-semibold tabular">
              {currentProgress === null ? '0' : currentProgress}%
            </span>{' '}
            to{' '}
            <span className="font-medium text-foreground tabular">
              {nextProgress}%
            </span>
            {nextScaled !== null ? (
              <>
                {' · scaled progress '}
                <span className="font-medium text-foreground tabular">
                  {formatNumeric(nextScaled)}
                </span>
              </>
            ) : null}
          </p>
        ) : null}

        <Field
          id="log-notes"
          label="Update notes"
          hint="What moved, what is blocked, what is next."
        >
          <Textarea
            id="log-notes"
            name="updateNotes"
            defaultValue={log?.updateNotes ?? ''}
            rows={3}
            placeholder="Completed the beam schedule and issued it for review."
          />
        </Field>

        <RawLinksField links={links} onChange={setLinks} />

        {error ? <FormError message={error} /> : null}
      </div>

      <SheetFooter className="border-border flex-row justify-end border-t">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending || noTasks}>
          {pending ? (
            <>
              <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
              Saving
            </>
          ) : isEdit ? (
            'Save changes'
          ) : (
            'Save log'
          )}
        </Button>
      </SheetFooter>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Raw links                                                                  */
/* -------------------------------------------------------------------------- */

interface RawLinksFieldProps {
  links: readonly string[];
  onChange: (next: string[]) => void;
}

/**
 * Repeatable URL inputs for drive files, drawings and boards.
 *
 * Every row shares the `rawLinks` name, so the Server Action collects them with
 * `formData.getAll`. Blank rows are dropped server-side, which is why an empty
 * row can be left in place without consequence.
 */
function RawLinksField({ links, onChange }: RawLinksFieldProps) {
  const update = (index: number, value: string) => {
    onChange(links.map((link, i) => (i === index ? value : link)));
  };

  const remove = (index: number) => {
    const next = links.filter((_, i) => i !== index);
    onChange(next.length > 0 ? next : ['']);
  };

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-foreground">Raw links</legend>
      <p className="text-xs text-muted-foreground">
        Drive files, drawings or boards. http and https only.
      </p>

      <ul className="flex flex-col gap-2">
        {links.map((link, index) => (
          // Index-keyed on purpose: these rows have no stable identity, and
          // keying by value would remount the focused input on every keystroke.
          <li key={index} className="flex items-center gap-2">
            <div className="relative flex-1">
              <LinkIcon
                className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                name="rawLinks"
                type="url"
                inputMode="url"
                value={link}
                onChange={(event) => update(index, event.target.value)}
                placeholder="https://drive.example.com/file"
                aria-label={`Raw link ${index + 1}`}
                className="pl-8"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => remove(index)}
              aria-label={`Remove raw link ${index + 1}`}
              disabled={links.length === 1 && link === ''}
            >
              <XIcon aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ul>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...links, ''])}
        disabled={links.length >= 10}
        className="self-start"
      >
        <PlusIcon aria-hidden="true" />
        Add link
      </Button>
    </fieldset>
  );
}

/* -------------------------------------------------------------------------- */
/* Shared bits                                                                */
/* -------------------------------------------------------------------------- */
