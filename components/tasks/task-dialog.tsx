'use client';

import * as React from 'react';
import { AlertCircleIcon, LoaderCircleIcon } from 'lucide-react';

import {
  createTask,
  updateTask,
  type TaskActionState,
} from '@/app/tasks/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  CATEGORY_LABELS,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
} from '@/lib/tracker/enums';
import { cn } from '@/lib/utils';
import type { Task, User } from '@/types/tracker';

/** `null` opens the form in create mode; a task opens it in edit mode. */
export interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  members: readonly User[];
  /** Pre-selected assignee for new tasks, normally the current user. */
  defaultAssigneeId: string;
}

/**
 * Sentinel for "no reviewer".
 *
 * Radix Select reserves the empty string for "nothing selected", so an optional
 * reference cannot round-trip as `''`. The Server Action maps this value back to
 * NULL.
 */
const NO_REVIEWER = 'none';

const INITIAL_STATE: TaskActionState | null = null;

/**
 * Create and edit form.
 *
 * Presented as a drawer: bottom-anchored so it behaves as the full-width sheet
 * the mobile spec asks for, and constrained on wider screens so it reads as a
 * centred dialog.
 *
 * Covers the eight fields in the brief. Status and progress are deliberately
 * absent — both are edited in place in the grid and cards, and a second path
 * here would let a stale form overwrite a fresher inline change.
 */
export function TaskDialog({
  open,
  onOpenChange,
  task,
  members,
  defaultAssigneeId,
}: TaskDialogProps) {
  const isEdit = task !== null;

  const [createState, createAction, createPending] = React.useActionState(
    createTask,
    INITIAL_STATE,
  );
  const [editState, editAction, editPending] = React.useActionState(
    updateTask,
    INITIAL_STATE,
  );

  const state = isEdit ? editState : createState;
  const pending = isEdit ? editPending : createPending;
  const error = state && !state.success ? state.error : undefined;

  // Close once the action reports success. Data refresh is handled by the
  // revalidatePath calls inside the actions.
  const succeeded = state?.success === true;
  React.useEffect(() => {
    if (succeeded && open) onOpenChange(false);
  }, [succeeded, open, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] gap-0 sm:mx-auto sm:max-w-2xl sm:rounded-t-xl"
      >
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit task' : 'New task'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? `Update the details for ${task.taskTag}.`
              : 'Define the work, its weight, and who owns it.'}
          </SheetDescription>
        </SheetHeader>

        {/*
          Keyed so switching task — or moving between create and edit — mounts a
          fresh form. Without it React reuses the inputs and the previous task's
          values linger as defaults.
        */}
        <TaskForm
          key={task?.id ?? 'create'}
          task={task}
          members={members}
          defaultAssigneeId={defaultAssigneeId}
          action={isEdit ? editAction : createAction}
          pending={pending}
          error={error}
          onCancel={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* Form                                                                       */
/* -------------------------------------------------------------------------- */

interface TaskFormProps {
  task: Task | null;
  members: readonly User[];
  defaultAssigneeId: string;
  action: (formData: FormData) => void;
  pending: boolean;
  error?: string;
  onCancel: () => void;
}

function TaskForm({
  task,
  members,
  defaultAssigneeId,
  action,
  pending,
  error,
  onCancel,
}: TaskFormProps) {
  const isEdit = task !== null;

  // Selects are controlled so their triggers can render a resolved label
  // directly, rather than relying on Radix deriving it from items that only
  // mount once the menu has been opened.
  const [category, setCategory] = React.useState<string>(task?.category ?? 'T');
  const [priority, setPriority] = React.useState<string>(
    task?.priority ?? 'Medium',
  );
  const [assigneeId, setAssigneeId] = React.useState<string>(
    task?.assigneeId ?? defaultAssigneeId,
  );
  const [reviewerId, setReviewerId] = React.useState<string>(
    task?.reviewerId ?? NO_REVIEWER,
  );

  const activeMembers = members.filter((member) => member.isActive);

  const memberOptions = activeMembers.map((member) => ({
    value: member.id,
    label: member.fullName,
  }));

  return (
    <form action={action} className="flex min-h-0 flex-1 flex-col">
      {isEdit ? <input type="hidden" name="taskId" value={task.id} /> : null}

      <div className="grid gap-4 overflow-y-auto px-4 py-4 sm:grid-cols-2">
        <Field id="task-title" label="Title" className="sm:col-span-2" required>
          <Input
            id="task-title"
            name="title"
            defaultValue={task?.title ?? ''}
            maxLength={255}
            placeholder="Structural load calculations"
            required
            aria-invalid={error !== undefined}
          />
        </Field>

        <Field
          id="task-tag"
          label="Task tag"
          hint="Unique across the workspace, e.g. Sep26_T5"
          required
        >
          <Input
            id="task-tag"
            name="taskTag"
            defaultValue={task?.taskTag ?? ''}
            maxLength={30}
            placeholder="Sep26_T5"
            required
            className="font-mono"
          />
        </Field>

        <Field
          id="task-scale"
          label="Scale weight"
          hint="Relative work weight. Zero excludes the task from team metrics."
        >
          <Input
            id="task-scale"
            name="taskScale"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            defaultValue={task?.taskScale ?? ''}
            placeholder="0.00"
          />
        </Field>

        <LabeledSelect
          id="task-category"
          label="Category"
          name="category"
          value={category}
          onValueChange={setCategory}
          options={TASK_CATEGORIES.map((entry) => ({
            value: entry,
            label: `${entry} · ${CATEGORY_LABELS[entry]}`,
          }))}
          required
        />

        <LabeledSelect
          id="task-priority"
          label="Priority"
          name="priority"
          value={priority}
          onValueChange={setPriority}
          options={TASK_PRIORITIES.map((entry) => ({
            value: entry,
            label: entry,
          }))}
          required
        />

        <Field id="task-due-date" label="Due date">
          <Input
            id="task-due-date"
            name="dueDate"
            type="date"
            defaultValue={task?.dueDate ?? ''}
          />
        </Field>

        <LabeledSelect
          id="task-assignee"
          label="Assignee"
          name="assigneeId"
          value={assigneeId}
          onValueChange={setAssigneeId}
          options={memberOptions}
          required
        />

        <LabeledSelect
          id="task-reviewer"
          label="Reviewer"
          name="reviewerId"
          value={reviewerId}
          onValueChange={setReviewerId}
          options={[
            { value: NO_REVIEWER, label: 'No reviewer' },
            ...memberOptions,
          ]}
          hint="Optional second pair of eyes."
        />

        {error ? (
          <div
            role="alert"
            aria-live="polite"
            className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 sm:col-span-2"
          >
            <AlertCircleIcon
              className="mt-0.5 size-4 shrink-0"
              aria-hidden="true"
            />
            <span>{error}</span>
          </div>
        ) : null}
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
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
              Saving
            </>
          ) : isEdit ? (
            'Save changes'
          ) : (
            'Create task'
          )}
        </Button>
      </SheetFooter>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Fields                                                                     */
/* -------------------------------------------------------------------------- */

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

function Field({
  id,
  label,
  hint,
  required = false,
  className,
  children,
}: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        {label}
        {required ? (
          <span className="ml-0.5 text-rose-600" aria-hidden="true">
            *
          </span>
        ) : null}
        {required ? <span className="sr-only">(required)</span> : null}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

interface LabeledSelectProps {
  id: string;
  label: string;
  name: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  hint?: string;
  required?: boolean;
  className?: string;
}

/**
 * Select wrapped in a label. `name` is kept so Radix emits the hidden native
 * control that carries the value into the form submission.
 */
function LabeledSelect({
  id,
  label,
  name,
  value,
  onValueChange,
  options,
  hint,
  required = false,
  className,
}: LabeledSelectProps) {
  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? '';

  return (
    <Field
      id={id}
      label={label}
      hint={hint}
      required={required}
      className={className}
    >
      <Select
        name={name}
        value={value}
        onValueChange={onValueChange}
        required={required}
      >
        <SelectTrigger id={id} aria-describedby={hint ? `${id}-hint` : undefined}>
          {selectedLabel}
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
