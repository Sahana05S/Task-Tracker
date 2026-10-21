'use client';

import * as React from 'react';
import Link from 'next/link';
import { CheckCircle2Icon, LoaderCircleIcon } from 'lucide-react';

import { missionCount, operationSpec, reasonRequired } from '@/modules/tasks/components/tools/operations';
import { useToolOperation, type ToolOperationState, type ToolPayload } from '@/modules/tasks/components/tools/use-tool-operation';
import type { ToolOperation, ToolsPreview } from '@/modules/tasks/internal/tools/contract';
import { Button } from '@/shared/ui/button';
import { Field, FormError } from '@/shared/ui/form-field';
import { MissionNotice } from '@/shared/ui/mission-ui';
import { NativeSelect } from '@/shared/ui/native-select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/shared/ui/sheet';
import { formatDate, formatDateTime } from '@/shared/tracker/format';
import { codeLabel } from '@/shared/tracker/labels';
import { kolkataDate } from '@/shared/time/kolkata';
import type { Task, User } from '@/types/tracker';

export interface OperationDrawerProps {
  /** The operation to run; null keeps the drawer closed. */
  command: ToolOperation | null;
  /** Batch: the selected missions. Copy: exactly one source mission. */
  tasks: readonly Task[];
  members: readonly User[];
  memberNames: ReadonlyMap<string, string>;
  onClose: () => void;
  /** Called once a commit succeeds, so the list can clear its selection. */
  onCommitted?: (command: ToolOperation) => void;
}

const SCOPE_TAGS = 6;

/**
 * One Task Tools operation in a side drawer: that operation's inputs, the
 * database preview, then Commit. Nothing changes until Commit; editing an
 * input after a preview drops it, so what is committed is always what was
 * reviewed.
 */
export function OperationDrawer({ command, tasks, members, memberNames, onClose, onCommitted }: OperationDrawerProps) {
  const operation = useToolOperation({
    onCommitted: () => {
      if (command) onCommitted?.(command);
    },
  });
  const { pending, reset } = operation;

  const close = () => {
    if (pending) return;
    reset();
    onClose();
  };

  return (
    <Sheet open={command !== null} onOpenChange={(open) => { if (!open) close(); }}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-xl">
        {command ? (
          <OperationBody
            // A new command or source starts from clean inputs.
            key={`${command}:${tasks.map((task) => task.id).join(',')}`}
            command={command}
            tasks={tasks}
            members={members}
            memberNames={memberNames}
            operation={operation}
            onClose={close}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function OperationBody({
  command,
  tasks,
  members,
  memberNames,
  operation,
  onClose,
}: {
  command: ToolOperation;
  tasks: readonly Task[];
  members: readonly User[];
  memberNames: ReadonlyMap<string, string>;
  operation: ToolOperationState;
  onClose: () => void;
}) {
  const spec = operationSpec(command);
  const { preview, result, message, pending, prepare, commit, invalidate } = operation;
  const [splitMode, setSplitMode] = React.useState('split-even');
  const needsReason = reasonRequired(command, splitMode);
  const formId = `operation-${command}`;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    prepare(command, buildPayload(command, tasks, new FormData(event.currentTarget)));
  };

  return (
    <>
      <SheetHeader className="border-border border-b pb-4">
        <p className="eyebrow">{spec.kind === 'copy' ? 'Copy mission' : tasks.length === 1 ? 'Mission action' : 'Batch action'}</p>
        <SheetTitle className="pr-8 text-lg">{spec.title}</SheetTitle>
        <SheetDescription>{spec.summary}</SheetDescription>
        <Scope tasks={tasks} copy={spec.kind === 'copy'} />
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5">
        {result ? (
          <CommitResult items={result.items} />
        ) : (
          <form
            id={formId}
            onSubmit={submit}
            onChange={() => { if (preview || message) invalidate(); }}
            className="grid gap-4"
          >
            <fieldset disabled={pending} className="contents">
              <OperationFields command={command} members={members} splitMode={splitMode} onSplitModeChange={setSplitMode} />
              <Field id={`${formId}-reason`} label="Reason" required={needsReason} hint={needsReason ? 'Kept with the change history.' : 'Optional; kept with the change history.'}>
                <textarea id={`${formId}-reason`} name="reason" maxLength={1000} required={needsReason} className="field w-full" rows={2} />
              </Field>
            </fieldset>
          </form>
        )}

        {preview && !result ? <PreviewTable preview={preview} names={memberNames} copy={spec.kind === 'copy'} /> : null}

        <FormError message={message || undefined} />
      </div>

      <SheetFooter className="border-border flex-row justify-end border-t py-4">
        {result ? (
          <Button type="button" onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
            {preview && message ? (
              // A refused commit (expired, source changed) needs a fresh preview.
              <Button type="submit" form={formId} variant="outline" disabled={pending}>Preview again</Button>
            ) : null}
            {preview ? (
              <Button type="button" onClick={commit} disabled={pending || !preview.ready}>
                {pending ? <LoaderCircleIcon className="animate-spin" aria-hidden="true" /> : null}
                {pending ? 'Committing…' : `Commit ${missionCount(preview.items.length)}`}
              </Button>
            ) : (
              <Button type="submit" form={formId} disabled={pending}>
                {pending ? <LoaderCircleIcon className="animate-spin" aria-hidden="true" /> : null}
                {pending ? 'Preparing…' : 'Preview'}
              </Button>
            )}
          </>
        )}
      </SheetFooter>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Scope, fields and payload                                                  */
/* -------------------------------------------------------------------------- */

function Scope({ tasks, copy }: { tasks: readonly Task[]; copy: boolean }) {
  if (copy && tasks[0]) {
    return (
      <p className="text-foreground mt-2 text-sm">
        Source <span className="task-tag">{tasks[0].taskTag}</span> <span className="text-muted-foreground">· {tasks[0].title}</span>
      </p>
    );
  }
  const shown = tasks.slice(0, SCOPE_TAGS);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
      <span className="text-foreground font-medium">{missionCount(tasks.length)}</span>
      {shown.map((task) => <span key={task.id} className="badge-soft badge-neutral task-tag">{task.taskTag}</span>)}
      {tasks.length > shown.length ? <span className="text-muted-foreground text-xs">+{tasks.length - shown.length} more</span> : null}
    </div>
  );
}

function OperationFields({
  command,
  members,
  splitMode,
  onSplitModeChange,
}: {
  command: ToolOperation;
  members: readonly User[];
  splitMode: string;
  onSplitModeChange: (mode: string) => void;
}) {
  const id = (name: string) => `operation-${command}-${name}`;
  const copy = operationSpec(command).kind === 'copy';
  const phases = command === 'weekly' || command === 'day_count';
  const counted = phases || command === 'number_suffix';

  return (
    <>
      {copy ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={id('start')} label="Assignment date" required>
            <input id={id('start')} name="startDate" type="date" required defaultValue={kolkataDate()} className="field w-full" />
          </Field>
          {!phases ? (
            <Field id={id('due')} label="New deadline">
              <input id={id('due')} name="dueDate" type="date" className="field w-full" />
            </Field>
          ) : null}
        </div>
      ) : null}

      {counted ? (
        <Field id={id('count')} label="Number of missions" required hint="1 to 100.">
          <input id={id('count')} name="count" type="number" min={1} max={100} required className="field w-full" />
        </Field>
      ) : null}

      {command === 'day_count' ? (
        <Field id={id('days')} label="Days per phase" required hint="Calendar days, 1 to 366.">
          <input id={id('days')} name="phaseDays" type="number" min={1} max={366} required className="field w-full" />
        </Field>
      ) : null}

      {command === 'number_suffix' ? (
        <Field id={id('suffix')} label="Title suffix">
          <input id={id('suffix')} name="suffix" maxLength={100} className="field w-full" />
        </Field>
      ) : null}

      {command === 'carryover' ? (
        <Field id={id('month')} label="Target month" required hint="Only the current month is accepted.">
          <input id={id('month')} name="targetMonth" type="month" required defaultValue={kolkataDate().slice(0, 7)} className="field w-full" />
        </Field>
      ) : null}

      {command === 'support' ? (
        <>
          <Field id={id('assignee')} label="Support member" required>
            <NativeSelect id={id('assignee')} name="assigneeId" required defaultValue="">
              <option value="" disabled>Select a member</option>
              {members.filter((member) => member.isActive).map((member) => (
                <option key={member.id} value={member.id}>{member.fullName}</option>
              ))}
            </NativeSelect>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id={id('kind')} label="Support kind">
              <NativeSelect id={id('kind')} name="supportKind" defaultValue="effort">
                <option value="effort">Effort (source type)</option>
                <option value="skill">Skill (SD)</option>
              </NativeSelect>
            </Field>
            <Field id={id('mode')} label="Scale split">
              <NativeSelect id={id('mode')} name="splitMode" value={splitMode} onChange={(event) => onSplitModeChange(event.target.value)}>
                <option value="split-even">Even: half moves over</option>
                <option value="split-uneven">Uneven: an amount moves over</option>
                <option value="proportional">Proportional: a percentage</option>
                <option value="absolute">Absolute: its own scale</option>
              </NativeSelect>
            </Field>
          </div>
          {splitMode === 'split-uneven' || splitMode === 'absolute' ? (
            <Field id={id('amount')} label="Scale units" required>
              <input id={id('amount')} name="amount" type="number" step="any" min={0} required className="field w-full" />
            </Field>
          ) : null}
          {splitMode === 'proportional' ? (
            <Field id={id('percent')} label="Source percentage" required hint="0 to 100%.">
              <input id={id('percent')} name="percentage" type="number" step="any" min={0} max={100} required className="field w-full" />
            </Field>
          ) : null}
        </>
      ) : null}

      {command === 'section' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={id('section')} label="Section">
            <NativeSelect id={id('section')} name="section" defaultValue="setup">
              <option value="setup">Setup</option>
              <option value="activity">Activity</option>
              <option value="closure">Closure</option>
            </NativeSelect>
          </Field>
          <Field id={id('empty')} label="Confirm as">
            <NativeSelect id={id('empty')} name="intentionalEmpty" defaultValue="false">
              <option value="false">Initialized, keep leaf work</option>
              <option value="true">Intentionally empty</option>
            </NativeSelect>
          </Field>
        </div>
      ) : null}
    </>
  );
}

const NUMERIC_FIELDS = new Set(['count', 'phaseDays']);

/** The command payload: the scope from the selection plus the drawer's inputs. */
export function buildPayload(command: ToolOperation, tasks: readonly Task[], form: FormData): ToolPayload {
  const payload: ToolPayload = operationSpec(command).kind === 'copy'
    ? { sourceTaskId: tasks[0]?.id }
    : { taskIds: tasks.map((task) => task.id) };
  for (const [name, value] of form.entries()) {
    if (typeof value !== 'string' || value.trim() === '') continue;
    if (NUMERIC_FIELDS.has(name)) payload[name] = Number(value);
    else if (name === 'intentionalEmpty') payload[name] = value === 'true';
    else payload[name] = value.trim();
  }
  return payload;
}

/* -------------------------------------------------------------------------- */
/* Preview and result                                                         */
/* -------------------------------------------------------------------------- */

function PreviewTable({ preview, names, copy }: { preview: ToolsPreview; names: ReadonlyMap<string, string>; copy: boolean }) {
  const person = (id: string) => names.get(id) ?? 'Unknown member';
  return (
    <section aria-labelledby="operation-preview" className="grid gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="operation-preview" className="text-foreground text-sm font-semibold">Preview · {missionCount(preview.items.length)}</h3>
        <p className="text-muted-foreground text-xs">Expires {formatDateTime(preview.expiresAt)}</p>
      </div>
      {preview.ready ? null : (
        <MissionNotice tone="attention" role="status">
          This cannot be committed: {preview.reasons.map((reason) => codeLabel(reason)).join('; ')}.
        </MissionNotice>
      )}
      {preview.sourceScaleBefore !== null ? (
        <p className="text-sm">Source scale {preview.sourceScaleBefore} → {preview.sourceScaleAfter ?? 'unchanged'}</p>
      ) : null}
      <div className="border-border overflow-x-auto rounded-xl border">
        <table className="sheet-grid w-full">
          <thead>
            <tr>{['Mission', 'Dates', 'Scale', 'Assignees', 'Reviewers'].map((label) => <th key={label} scope="col">{label}</th>)}</tr>
          </thead>
          <tbody>
            {preview.items.map((item, index) => (
              <tr key={item.taskTag ?? `planned-${index}`}>
                <td className="min-w-48">
                  <span className="task-tag">{item.taskTag ?? 'Tag on commit'}</span>
                  <span className="text-muted-foreground block truncate text-xs" title={item.title}>{item.title}</span>
                </td>
                <td className="text-xs whitespace-nowrap">{formatDate(item.assignedDate)} → {item.dueDate ? formatDate(item.dueDate) : 'no deadline'}</td>
                <td className="text-xs whitespace-nowrap tabular-nums">{item.scale ?? 'Unavailable'} <span className="text-muted-foreground">{codeLabel(item.scaleMode)}</span></td>
                <td className="text-xs">
                  {item.assignees?.length
                    ? item.assignees.map((id, i) => `${person(id)}${item.shares?.[i] === undefined ? '' : ` ${item.shares[i] / 10000}%`}`).join(', ')
                    : 'Unchanged'}
                </td>
                <td className="text-xs">{item.reviewers?.length ? item.reviewers.map(person).join(', ') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {copy && Object.keys(preview.inheritance).length > 0 ? (
        <details className="disclosure">
          <summary>What the copies inherit</summary>
          <dl className="grid gap-2 px-4 py-3 text-sm">
            {Object.entries(preview.inheritance).map(([name, value]) => (
              <div key={name} className="grid gap-0.5">
                <dt className="text-foreground font-medium">{codeLabel(name)}</dt>
                <dd className="text-muted-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
    </section>
  );
}

function CommitResult({ items }: { items: readonly { taskId: string; taskTag: string; status: string }[] }) {
  return (
    <section aria-labelledby="operation-result" className="grid gap-3">
      <p id="operation-result" role="status" className="text-success-strong flex items-center gap-2 text-sm font-semibold">
        <CheckCircle2Icon className="size-4" aria-hidden="true" />
        Committed {missionCount(items.length)}
      </p>
      <ul className="border-border divide-border divide-y rounded-xl border">
        {items.map((item) => (
          <li key={item.taskId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <Link href={`/tasks/${encodeURIComponent(item.taskTag)}`} className="task-tag link">{item.taskTag}</Link>
            <span className="text-muted-foreground text-xs">{codeLabel(item.status)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
