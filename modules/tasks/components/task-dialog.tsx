'use client';
import { NativeTemplateSelect } from './native-details-editor';
import type { NativeTemplate } from '@/modules/tasks/internal/details-contract';
import { prepareOperation } from '@/shared/commands/client-operation';

import * as React from 'react';
import { LoaderCircleIcon } from 'lucide-react';
import { toast } from 'sonner';

import {
  createTask,
  updateTask,
  type TaskActionState,
} from '@/modules/tasks/actions';
import { Button } from '@/shared/ui/button';
import { Field, FormError, LabeledSelect } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { NativeSelect } from '@/shared/ui/native-select';
import { Textarea } from '@/shared/ui/textarea';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet';
import { TASK_PRIORITIES } from '@/shared/tracker/enums';
import { categoryChoices, SCALE_MODE_LABELS, type StandingScaleMode } from '@/modules/settings/client';
import { useCategoryCatalogue, useDefaultScaleMode } from '@/modules/settings/components/company-settings-context';
import type { Task, User } from '@/types/tracker';
import type { Label } from '@/modules/labels/client';
import { attachPickedLabels, LabelPicker, type PickedLabel } from '@/modules/labels/components/label-picker';

/** `null` opens the form in create mode; a task opens it in edit mode. */
export interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: Task | null;
  members: readonly User[];
  /** Pre-selected assignee for new tasks, normally the current user. */
  defaultAssigneeId: string;
  templates?: readonly NativeTemplate[];
  /** The company's labels (migration 112); null or absent hides the Labels field on a new mission. */
  labelCatalogue?: readonly Label[] | null;
  /** May create a label while typing it (managing director and project engineers). */
  canCreateLabels?: boolean;
}

const INITIAL_STATE: TaskActionState | null = null;

const SCALE_MODE_HINTS: Record<StandingScaleMode, string> = {
  manual: 'A number you type now; it changes only when edited.',
  hours: 'Grows with every hour logged on the mission.',
  activity_count: 'Activities counted from the register.',
};

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
  templates=[],
  labelCatalogue = null,
  canCreateLabels = false,
}: TaskDialogProps) {
  const isEdit = task !== null;

  const [createState, createAction, createPending] = React.useActionState(
    async (previous:TaskActionState|null,form:FormData)=>{try {const finish=await prepareOperation(form,'save_task_with_participants'); const result=await createTask(previous,form); if(result.success) {finish(); await attachNewMissionLabels(result.data?.taskId, form);} return result;} catch {return {success:false,error:'Response interrupted; retry the same task to recover its result.'};}},
    INITIAL_STATE,
  );
  const [editState, editAction, editPending] = React.useActionState(
    async (previous:TaskActionState|null,form:FormData)=>{try {const finish=await prepareOperation(form,'save_task_with_participants'); const result=await updateTask(previous,form); if(result.success) finish(); return result;} catch {return {success:false,error:'Response interrupted; retry the same edit to recover its result.'};}},
    INITIAL_STATE,
  );

  const state = isEdit ? editState : createState;
  const pending = isEdit ? editPending : createPending;
  const error = state && !state.success ? state.error : undefined;

  // Close once the action reports success. Data refresh is handled by the
  // revalidatePath calls inside the actions.
  const succeeded = state?.success === true;
  const handledState=React.useRef<TaskActionState|null>(null);
  // Typed but unsaved: an outside tap, Escape or the phone's back button asks before discarding.
  const dirty = React.useRef(false);
  React.useEffect(() => { if (open) dirty.current = false; }, [open]);
  React.useEffect(() => {
    if (succeeded && open && state!==handledState.current) {handledState.current=state;dirty.current=false;onOpenChange(false);}
  }, [succeeded, open, onOpenChange, state]);
  const requestOpenChange = (next: boolean) => {
    if (!next && dirty.current && !window.confirm(isEdit ? 'Discard your changes to this mission?' : 'Discard this new mission? It is not saved.')) return;
    if (!next) dirty.current = false;
    onOpenChange(next);
  };
  const markDirty = () => { dirty.current = true; };

  return (
    <Sheet open={open} onOpenChange={requestOpenChange}>
      <SheetContent
        onInputCapture={markDirty}
        onChangeCapture={markDirty}
        side="bottom"
        className="max-h-[92dvh] gap-0 sm:mx-auto sm:max-w-2xl sm:rounded-t-xl"
      >
        <SheetHeader>
          <SheetTitle>{isEdit ? 'Edit mission' : 'New mission'}</SheetTitle>
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
          templates={templates}
          action={isEdit ? editAction : createAction}
          labelCatalogue={labelCatalogue}
          canCreateLabels={canCreateLabels}
          pending={pending}
          error={error}
          onCancel={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

/**
 * Labels picked on a new mission (migration 112), attached once it exists:
 * one label_link_command each, so the database still decides who may. A
 * refused label never undoes the mission; the toast says which were missed.
 */
async function attachNewMissionLabels(taskId: string | undefined, form: FormData) {
  const raw = form.get('labelPicks');
  if (!taskId || typeof raw !== 'string' || raw === '' || raw === '[]') return;
  let picks: PickedLabel[];
  try { picks = JSON.parse(raw) as PickedLabel[]; } catch { return; }
  if (!Array.isArray(picks) || picks.length === 0) return;
  const { failed, error } = await attachPickedLabels('task', taskId, picks, '/tasks');
  if (failed.length) {
    toast.error(`Mission saved, but ${failed.map((name) => `#${name}`).join(', ')} ${failed.length === 1 ? 'was' : 'were'} not added.${error ? ` ${error}` : ''} Add ${failed.length === 1 ? 'it' : 'them'} on the mission's Details tab.`);
  }
}

/* -------------------------------------------------------------------------- */
/* Form                                                                       */
/* -------------------------------------------------------------------------- */

interface TaskFormProps {
  task: Task | null;
  members: readonly User[];
  defaultAssigneeId: string;
  templates?: readonly NativeTemplate[];
  action: (formData: FormData) => void;
  labelCatalogue?: readonly Label[] | null;
  canCreateLabels?: boolean;
  pending: boolean;
  error?: string;
  onCancel: () => void;
}

function TaskForm({
  task,
  members,
  defaultAssigneeId,
  action,
  labelCatalogue = null,
  canCreateLabels = false,
  pending,
  error,
  onCancel,
  templates=[],
}: TaskFormProps) {
  const isEdit = task !== null;
  // Labels for a new mission, attached after it is created (see attachNewMissionLabels).
  const [labelPicks, setLabelPicks] = React.useState<PickedLabel[]>([]);
  // The company's mission types: hidden ones are left out, except the type
  // this mission already has.
  const catalogue = useCategoryCatalogue();
  const categories = categoryChoices(catalogue, task?.category);

  // Selects are controlled so their triggers can render a resolved label
  // directly, rather than relying on Radix deriving it from items that only
  // mount once the menu has been opened.
  const [category, setCategory] = React.useState<string>(
    task?.category ?? (categories.some((entry) => entry.code === 'T') ? 'T' : categories[0]?.code ?? 'T'),
  );
  const [priority, setPriority] = React.useState<string>(
    task?.priority ?? 'Medium',
  );
  // New missions start with the company's default (Settings > Company > New missions).
  const defaultScaleMode = useDefaultScaleMode();
  const [scaleMode, setScaleMode] = React.useState<StandingScaleMode>(defaultScaleMode);
  const [operationId, setOperationId] = React.useState('');
  React.useEffect(() => setOperationId(crypto.randomUUID()), []);
  // The whole Crew (migration 121): everyone listed shares the credit equally.
  const [assigneeIds, setAssigneeIds] = React.useState<Set<string>>(
    () => new Set(task ? task.assigneeIds : [defaultAssigneeId]),
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
    // React 19 resets a form after every action, including a refused one, which
    // cleared typed text and desynchronized the controlled assignee/reviewer
    // checkboxes from what the next submit sends. A default-prevented onSubmit
    // dispatching in a transition makes React skip that reset; `action` keeps
    // React's guard against native pre-hydration submission.
    <form
      action={action}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        React.startTransition(() => action(data));
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      {isEdit ? <input type="hidden" name="taskId" value={task.id} /> : null}
      <input type="hidden" name="lifecycleVersion" value={task?.lifecycleVersion ?? 0} />
      <input type="hidden" name="participantVersion" value={task?.participantVersion ?? 0} />
      <input type="hidden" name="operationId" value={operationId} />
      {!isEdit && labelPicks.length ? <input type="hidden" name="labelPicks" value={JSON.stringify(labelPicks)} /> : null}

      {/*
        One scroll region for every field. Anything placed outside it either
        squeezes the grid to a few pixels or sits unpadded against the sheet
        edge, which is how the shares block used to overflow the dialog.
      */}
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-5 py-5 sm:grid-cols-2">
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
          hint={isEdit ? 'Tags stay fixed once a mission exists.' : 'Leave blank for the next tag in the sheet format, e.g. Oct26_T5.'}
          required={isEdit}
        >
          <Input
            id="task-tag"
            name="taskTag"
            readOnly={Boolean(task)}
            defaultValue={task?.taskTag ?? ''}
            maxLength={30}
            placeholder={isEdit ? undefined : 'Assigned on save'}
            required={isEdit}
            className="font-mono"
          />
        </Field>

        {isEdit ? (
          <Field
            id="task-scale"
            label="Scale weight"
            hint="Change it from the mission's Lifecycle and scale panel."
          >
            <Input id="task-scale" name="taskScale" readOnly type="number" defaultValue={task.taskScale ?? ''} />
          </Field>
        ) : (
          <>
            <Field
              id="task-scale-mode"
              label="Weighted by"
              hint={SCALE_MODE_HINTS[scaleMode]}
            >
              <NativeSelect
                id="task-scale-mode"
                name="scaleMode"
                value={scaleMode}
                onChange={(event) => setScaleMode(event.target.value as StandingScaleMode)}
              >
                {(['manual', 'hours', 'activity_count'] as const).map((mode) => (
                  <option key={mode} value={mode}>
                    {SCALE_MODE_LABELS[mode]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {scaleMode === 'manual' ? (
              <Field id="task-scale" label="Scale weight" hint="Relative work weight. Zero excludes the mission from team metrics.">
                <Input id="task-scale" name="taskScale" type="number" min={0} step="0.01" inputMode="decimal" placeholder="0.00" />
              </Field>
            ) : scaleMode === 'hours' ? (
              <Field id="task-scale-multiplier" label="Multiplier" hint="Scale = hours logged x 12.5 x this number." required>
                <Input id="task-scale-multiplier" name="scaleMultiplier" type="number" min={0} step="any" inputMode="decimal" defaultValue="1" required />
              </Field>
            ) : (
              <>
                <Field id="task-scale-count" label="Number of activities" hint="A whole number from the activity register." required>
                  <Input id="task-scale-count" name="scaleActivityCount" type="number" min={0} step="1" inputMode="numeric" required />
                </Field>
                <Field id="task-scale-unit" label="Scale per activity" hint="Scale = activities x this number." required>
                  <Input id="task-scale-unit" name="scaleUnit" type="number" min={0} step="any" inputMode="decimal" defaultValue="1" required />
                </Field>
              </>
            )}
          </>
        )}

        <LabeledSelect
          id="task-category"
          label="Category"
          name="category"
          value={category}
          onValueChange={setCategory}
          options={categories.map((entry) => ({
            value: entry.code,
            label: `${entry.code} · ${entry.label}${entry.active ? '' : ' (hidden)'}`,
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

        {!isEdit ? (
          <>
            <NativeTemplateSelect templates={templates} />
            <Field
              id="task-initialization"
              label="Set up details"
              hint="Native detail sections can be created now or from the mission later."
            >
              <NativeSelect id="task-initialization" name="initializationMode" defaultValue="automatic">
                <option value="automatic">Automatically after saving</option>
                <option value="manual">Manually later</option>
              </NativeSelect>
            </Field>
            <Field id="task-description" label="Description" className="sm:col-span-2">
              <Textarea
                id="task-description"
                name="description"
                rows={3}
                placeholder="What the mission delivers and any context the assignee needs."
              />
            </Field>
            {labelCatalogue ? (
              <Field
                id="task-labels"
                label="Labels"
                className="sm:col-span-2"
                hint="Optional. Type # and part of a name; they are added once the mission is saved."
              >
                <LabelPicker
                  inputId="task-labels"
                  value={labelPicks}
                  onChange={(next) => { setLabelPicks(next); }}
                  catalogue={labelCatalogue}
                  canCreate={canCreateLabels}
                  disabled={pending}
                />
              </Field>
            ) : null}
          </>
        ) : null}

        <Field
          id="task-assignees"
          label="Crew"
          hint="At least one. Everyone on the crew logs time, can mark the mission Done and shares the credit equally. Observers are managed on the mission page."
          required
        >
          {/* Keeps the internal primary row where it is on an edit (no extra power). */}
          {task?.assigneeId ? <input type="hidden" name="ownerId" value={task.assigneeId} /> : null}
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

        {task?.participantCreditMode === 'legacy' ? (
          <div className="border-border bg-muted/40 grid gap-2 rounded-md border p-3 text-sm sm:col-span-2">
            <a
              href="/task-tools/participants"
              target="_blank"
              rel="noopener noreferrer"
              className="link"
            >
              Review participant reconciliation (opens in a new tab)
            </a>
            <label className="flex items-start gap-2">
              <input type="checkbox" name="acceptLegacyShares" className="accent-primary mt-1 size-3.5" />
              <span>I reviewed this mission&apos;s legacy participants and approve giving this crew equal shares.</span>
            </label>
            <p className="text-muted-foreground text-xs">
              Equal shares apply to future credit. Earlier earned credit and frozen reports stay unchanged.
            </p>
          </div>
        ) : null}

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
            'Create mission'
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
    <div className="border-border max-h-40 overflow-y-auto rounded-md border bg-card p-2">
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
