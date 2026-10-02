'use client';

import * as React from 'react';
import { LoaderCircleIcon } from 'lucide-react';

import {
  createTask,
  updateTask,
  type TaskActionState,
} from '@/app/tasks/actions';
import { Button } from '@/components/ui/button';
import { Field, FormError, LabeledSelect } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
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
  const [assigneeIds, setAssigneeIds] = React.useState<Set<string>>(
    () => new Set(task?.assigneeIds ?? [defaultAssigneeId]),
  );
  const [reviewerIds, setReviewerIds] = React.useState<Set<string>>(
    () => new Set(task?.reviewerIds ?? []),
  );

  const activeMembers = members.filter((member) => member.isActive);
  const toggleSelection = (
    current: Set<string>,
    nextValue: string,
    checked: boolean,
  ) => {
    const next = new Set(current);
    if (checked) {
      next.add(nextValue);
    } else {
      next.delete(nextValue);
    }
    return next;
  };

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

        <Field
          id="task-assignees"
          label="Assignees"
          hint="At least one. The first selected member becomes the primary assignee."
          required
        >
          <MemberCheckboxGroup
            name="assigneeIds"
            members={activeMembers}
            selectedIds={assigneeIds}
            onChange={(memberId, checked) =>
              setAssigneeIds((current) =>
                toggleSelection(current, memberId, checked),
              )
            }
          />
        </Field>

        <Field
          id="task-reviewers"
          label="Reviewers"
          hint="Optional. Multiple reviewers can be selected."
        >
          <MemberCheckboxGroup
            name="reviewerIds"
            members={activeMembers}
            selectedIds={reviewerIds}
            onChange={(memberId, checked) =>
              setReviewerIds((current) =>
                toggleSelection(current, memberId, checked),
              )
            }
          />
        </Field>

        <FormError message={error} className="sm:col-span-2" />
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

function MemberCheckboxGroup({
  name,
  members,
  selectedIds,
  onChange,
}: {
  name: string;
  members: readonly User[];
  selectedIds: ReadonlySet<string>;
  onChange: (memberId: string, checked: boolean) => void;
}) {
  return (
    <div className="border-border max-h-40 overflow-y-auto rounded-md border bg-white p-2">
      {members.map((member) => (
        <label
          key={member.id}
          className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
        >
          <input
            type="checkbox"
            name={name}
            value={member.id}
            checked={selectedIds.has(member.id)}
            onChange={(event) => onChange(member.id, event.target.checked)}
            className="accent-primary size-3.5"
          />
          <span className="truncate">{member.fullName}</span>
          <span className="text-muted-foreground ml-auto text-xs">
            {member.employeeId}
          </span>
        </label>
      ))}
    </div>
  );
}
