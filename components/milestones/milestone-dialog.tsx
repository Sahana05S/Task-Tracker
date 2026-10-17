'use client';

import * as React from 'react';
import { LoaderCircleIcon } from 'lucide-react';

import {
  createMilestone,
  updateMilestone,
  type MilestoneActionState,
} from '@/app/milestones/actions';
import { Button } from '@/shared/ui/button';
import { Field, FormError, LabeledSelect } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet';
import { Textarea } from '@/shared/ui/textarea';
import { MILESTONE_STATUSES } from '@/shared/tracker/enums';
import type { CompanyMilestone, User } from '@/types/tracker';

/** `null` opens the form in create mode; a milestone opens it in edit mode. */
export interface MilestoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  milestone: CompanyMilestone | null;
  members: readonly User[];
  /** Fires after a successful save, so the caller can raise the toast. */
  onSaved: (mode: 'created' | 'updated', title: string) => void;
}

/**
 * Sentinel for "no owner".
 *
 * Radix Select reserves the empty string for "nothing selected", so an optional
 * reference cannot round-trip as `''`. The Server Action maps this back to NULL,
 * which is how a team-wide milestone is stored.
 */
const NO_OWNER = 'none';

const INITIAL_STATE: MilestoneActionState | null = null;

/**
 * Create and edit form for a milestone.
 *
 * Bottom-anchored, so it behaves as the full-width sheet the mobile spec asks for
 * and reads as a centred dialog on wider screens — the same presentation as the
 * task editor, because it is the same kind of task.
 */
export function MilestoneDialog({
  open,
  onOpenChange,
  milestone,
  members,
  onSaved,
}: MilestoneDialogProps) {
  const isEdit = milestone !== null;

  const [createState, createAction, createPending] = React.useActionState(
    createMilestone,
    INITIAL_STATE,
  );
  const [editState, editAction, editPending] = React.useActionState(
    updateMilestone,
    INITIAL_STATE,
  );

  const state = isEdit ? editState : createState;
  const pending = isEdit ? editPending : createPending;
  const error = state && !state.success ? state.error : undefined;

  // Title is read at submit time rather than from state, because the action only
  // returns an id and the toast wants the name.
  const submittedTitle = React.useRef<string>('');

  const succeeded = state?.success === true;
  React.useEffect(() => {
    if (!succeeded || !open) return;

    onOpenChange(false);
    onSaved(isEdit ? 'updated' : 'created', submittedTitle.current);
  }, [succeeded, open, isEdit, onOpenChange, onSaved]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[92dvh] gap-0 sm:mx-auto sm:max-w-2xl sm:rounded-t-xl"
      >
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit milestone' : 'New milestone'}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? `Update the target and progress for ${milestone.title}.`
              : 'An outcome the team is aiming at, separate from assigned tasks.'}
          </SheetDescription>
        </SheetHeader>

        {/*
          Keyed so switching milestone — or moving between create and edit —
          mounts a fresh form. Without it React reuses the inputs and the previous
          milestone's values linger as defaults.
        */}
        <MilestoneForm
          key={milestone?.id ?? 'create'}
          milestone={milestone}
          members={members}
          action={isEdit ? editAction : createAction}
          pending={pending}
          error={error}
          onCancel={() => onOpenChange(false)}
          onSubmitTitle={(title) => {
            submittedTitle.current = title;
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* Form                                                                       */
/* -------------------------------------------------------------------------- */

interface MilestoneFormProps {
  milestone: CompanyMilestone | null;
  members: readonly User[];
  action: (formData: FormData) => void;
  pending: boolean;
  error?: string;
  onCancel: () => void;
  onSubmitTitle: (title: string) => void;
}

function MilestoneForm({
  milestone,
  members,
  action,
  pending,
  error,
  onCancel,
  onSubmitTitle,
}: MilestoneFormProps) {
  const isEdit = milestone !== null;

  // Selects are controlled so their triggers render a resolved label directly,
  // rather than relying on Radix deriving it from items that only mount once the
  // menu has been opened.
  const [status, setStatus] = React.useState<string>(
    milestone?.status ?? 'Planned',
  );
  const [ownerId, setOwnerId] = React.useState<string>(
    milestone?.ownerId ?? NO_OWNER,
  );

  const ownerOptions = [
    { value: NO_OWNER, label: 'Whole team' },
    ...members
      .filter((member) => member.isActive)
      .map((member) => ({ value: member.id, label: member.fullName })),
  ];

  return (
    <form
      action={action}
      onSubmit={(event) => {
        // Captured before the action runs so the success toast can name the
        // milestone; the action itself only returns an id.
        const field = event.currentTarget.elements.namedItem('title');
        onSubmitTitle(field instanceof HTMLInputElement ? field.value : '');
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      {isEdit ? (
        <input type="hidden" name="milestoneId" value={milestone.id} />
      ) : null}

      <div className="grid gap-4 overflow-y-auto px-4 py-4 sm:grid-cols-2">
        <Field
          id="milestone-title"
          label="Title"
          className="sm:col-span-2"
          required
        >
          <Input
            id="milestone-title"
            name="title"
            defaultValue={milestone?.title ?? ''}
            maxLength={120}
            placeholder="Construction Templates"
            required
            aria-invalid={error !== undefined}
          />
        </Field>

        <Field
          id="milestone-description"
          label="Description"
          hint="What counts as delivered. One or two sentences."
          className="sm:col-span-2"
        >
          <Textarea
            id="milestone-description"
            name="description"
            defaultValue={milestone?.description ?? ''}
            rows={3}
            aria-describedby="milestone-description-hint"
            className="min-h-20"
          />
        </Field>

        <LabeledSelect
          id="milestone-status"
          label="Status"
          name="status"
          value={status}
          onValueChange={setStatus}
          options={MILESTONE_STATUSES.map((entry) => ({
            value: entry,
            label: entry,
          }))}
          required
        />

        <LabeledSelect
          id="milestone-owner"
          label="Owner"
          name="ownerId"
          value={ownerId}
          onValueChange={setOwnerId}
          options={ownerOptions}
          hint="Leave as Whole team when nobody carries it alone."
        />

        <Field
          id="milestone-delivered"
          label="Delivered"
          hint="Units finished so far."
        >
          <Input
            id="milestone-delivered"
            name="deliveredCount"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            defaultValue={milestone?.deliveredCount ?? 0}
            aria-describedby="milestone-delivered-hint"
            className="font-mono"
          />
        </Field>

        <Field
          id="milestone-target"
          label="Target"
          hint="Leave blank when the goal is not countable."
        >
          <Input
            id="milestone-target"
            name="targetCount"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            defaultValue={milestone?.targetCount ?? ''}
            placeholder="—"
            aria-describedby="milestone-target-hint"
            className="font-mono"
          />
        </Field>

        <Field
          id="milestone-due-date"
          label="Due date"
          className="sm:col-span-2"
        >
          <Input
            id="milestone-due-date"
            name="dueDate"
            type="date"
            defaultValue={milestone?.dueDate ?? ''}
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
            'Create milestone'
          )}
        </Button>
      </SheetFooter>
    </form>
  );
}
