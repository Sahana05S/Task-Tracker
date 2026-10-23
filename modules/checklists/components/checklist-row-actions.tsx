'use client';

import * as React from 'react';
import { CopyIcon, CornerDownRightIcon, ExternalLinkIcon, Link2Icon, MoreHorizontalIcon, MoveIcon, PencilIcon, PlusIcon, Trash2Icon, ArrowDownIcon, ArrowUpIcon } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { Field } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/shared/ui/sheet';
import { formatMinutes } from '../internal/pages';
import { rowKind } from '../internal/table';
import type { ChecklistBranchRow } from '../internal/branch-types';
import { ChecklistVersionField } from './checklist-state-control';
import type { ActionResponse } from '@/types/tracker';

type Command = (form: FormData) => Promise<ActionResponse<unknown>>;

/** The serialisable part of a row the sheet needs. */
export type ChecklistActionRow = Pick<ChecklistBranchRow,
  'id' | 'checklistId' | 'parentNodeId' | 'nodeType' | 'title' | 'description' | 'section' | 'links'
  | 'estimatedMinutes' | 'elapsedSeconds' | 'childCount' | 'linkedTaskId'>;

const SELECT = 'border-input bg-card text-foreground focus-visible:ring-ring h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2';

/**
 * The row menu: add a row under this one, edit, move, link (managers),
 * duplicate and remove. Built on the client from the row itself, so a closed
 * menu adds nothing to the page.
 */
export function ChecklistRowActions({
  row,
  taskId,
  version,
  action,
  defaultOpen = false,
  manager,
  moveTargets,
  linkChoices,
}: {
  row: ChecklistActionRow;
  taskId: string;
  version: number;
  action: Command;
  defaultOpen?: boolean;
  manager: boolean;
  /** Rows in the same section this row may move under, plus the top level (id null). */
  moveTargets: readonly { id: string | null; title: string }[];
  /** Missions a manager may link this row to. */
  linkChoices: readonly { id: string; taskTag: string; title: string }[];
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const kind = rowKind(row);
  const estimate = formatMinutes(row.estimatedMinutes);
  const logged = row.elapsedSeconds > 0 ? formatMinutes(Math.max(1, Math.round(row.elapsedSeconds / 60))) : null;
  const id = (name: string) => `row-${row.id}-${name}`;
  const hidden = (
    <>
      <input type="hidden" name="checklist_id" value={row.checklistId} />
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="node_id" value={row.id} />
      <ChecklistVersionField fallback={version} />
    </>
  );
  // Every edit resends the row's place, link and type, which the command would otherwise clear.
  const place = (parentId: string | null, linkedTaskId: string | null) => (
    <>
      <input type="hidden" name="command" value="edit" />
      {hidden}
      <input type="hidden" name="section" value={row.section ?? ''} />
      <input type="hidden" name="parent_id" value={parentId ?? ''} />
      <input type="hidden" name="linked_task_id" value={linkedTaskId ?? ''} />
      <input type="hidden" name="node_type" value={linkedTaskId || row.nodeType === 'Task' ? 'Item' : row.nodeType} />
    </>
  );
  const targets = moveTargets.filter(target => target.id !== row.parentNodeId);
  const summary = kind === 'parent' ? `${row.childCount} row${row.childCount === 1 ? '' : 's'} inside` : kind === 'linked' ? 'Follows a linked mission' : 'Row';

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="size-8 rounded-lg" aria-label={`More for ${row.title}`}>
          <MoreHorizontalIcon aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="pr-12">
          <p className="text-muted-foreground text-xs font-semibold">{summary}</p>
          <SheetTitle className="text-foreground text-lg font-bold tracking-tight break-words">{row.title}</SheetTitle>
          <SheetDescription className="text-muted-foreground">
            {[estimate ? `Estimated ${estimate}` : null, logged ? `${logged} logged` : 'No time logged yet'].filter(Boolean).join(' · ')}
          </SheetDescription>
        </SheetHeader>

        <div className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto px-5 py-5">
          {row.description ? <p className="text-foreground text-sm whitespace-pre-wrap break-words">{row.description}</p> : null}
          {row.links.length ? (
            <ul className="grid gap-1.5 text-sm">
              {row.links.map((href, index) => (
                <li key={`${href}:${index}`}>
                  <a href={href} target="_blank" rel="noopener noreferrer" className="link inline-flex max-w-full items-center gap-1.5">
                    <ExternalLinkIcon className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{href}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : null}

          <div role="group" aria-label="Order" className="flex flex-wrap gap-2">
            {(['up', 'down'] as const).map((direction) => (
              <ExecutionForm key={direction} action={action} scope={`reorder:${row.id}:${direction}`}>
                <input type="hidden" name="command" value="reorder" />
                {hidden}
                <input type="hidden" name="direction" value={direction} />
                <Button type="submit" variant="outline" size="sm">
                  {direction === 'up' ? <ArrowUpIcon aria-hidden="true" /> : <ArrowDownIcon aria-hidden="true" />}
                  Move {direction}
                </Button>
              </ExecutionForm>
            ))}
          </div>

          {kind !== 'linked' && kind !== 'quest' && row.section ? (
            <section aria-labelledby={id('add-heading')} className="grid gap-2">
              <h3 id={id('add-heading')} className="text-foreground flex items-center gap-2 text-sm font-bold">
                <PlusIcon className="text-primary size-4" aria-hidden="true" />Add a row under this
              </h3>
              <p className="text-muted-foreground text-sm">
                {kind === 'parent' ? 'Its progress is the average of the rows under it.' : 'Once it has rows under it, its progress becomes their average instead of its own tick.'}
              </p>
              <ExecutionForm action={action} scope={`add-under:${row.id}`}>
                <input type="hidden" name="command" value="add" />
                <input type="hidden" name="checklist_id" value={row.checklistId} />
                <input type="hidden" name="taskId" value={taskId} />
                <ChecklistVersionField fallback={version} />
                <input type="hidden" name="section" value={row.section} />
                <input type="hidden" name="parent_id" value={row.id} />
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor={id('add-title')} className="sr-only">Title of the new row</label>
                  <Input id={id('add-title')} name="title" required maxLength={500} placeholder="Row title" className="h-9 min-w-40 flex-1" />
                  <Button type="submit" size="sm" className="h-9"><PlusIcon aria-hidden="true" />Add</Button>
                </div>
              </ExecutionForm>
            </section>
          ) : null}

          <section aria-labelledby={id('edit-heading')} className="soft-divider grid gap-3 pt-5">
            <h3 id={id('edit-heading')} className="text-foreground flex items-center gap-2 text-sm font-bold">
              <PencilIcon className="text-primary size-4" aria-hidden="true" />Edit
            </h3>
            <ExecutionForm action={action} scope={`edit:${row.id}`}>
              {place(row.parentNodeId, row.linkedTaskId)}
              <div className="grid gap-3">
                <Field id={id('title')} label="Title" required>
                  <Input id={id('title')} name="title" defaultValue={row.title} required maxLength={500} />
                </Field>
                <Field id={id('links')} label="Links" hint="One web address per line, up to ten.">
                  <Textarea id={id('links')} name="links" defaultValue={row.links.join('\n')} rows={2} placeholder="https://" />
                </Field>
                {kind === 'item' ? (
                  <Field id={id('estimate')} label="Estimated minutes">
                    <Input id={id('estimate')} name="estimated_minutes" type="number" min={0} max={100000} step={1} inputMode="numeric" defaultValue={row.estimatedMinutes ?? ''} className="tabular-nums" />
                  </Field>
                ) : null}
                <Field id={id('reason')} label="Why are you changing it?" hint="Kept with the checklist history." required>
                  <Input id={id('reason')} name="reason" required maxLength={1000} />
                </Field>
                <Button type="submit" className="justify-self-start">Save changes</Button>
              </div>
            </ExecutionForm>
          </section>

          {targets.length && row.section ? (
            <section aria-labelledby={id('move-heading')} className="soft-divider grid gap-3 pt-5">
              <h3 id={id('move-heading')} className="text-foreground flex items-center gap-2 text-sm font-bold">
                <MoveIcon className="text-primary size-4" aria-hidden="true" />Move
              </h3>
              <MoveForm row={row} targets={targets} action={action} place={place} id={id} />
            </section>
          ) : null}

          {manager && (kind === 'item' || kind === 'linked') ? (
            <section aria-labelledby={id('link-heading')} className="soft-divider grid gap-3 pt-5">
              <h3 id={id('link-heading')} className="text-foreground flex items-center gap-2 text-sm font-bold">
                <Link2Icon className="text-primary size-4" aria-hidden="true" />{kind === 'linked' ? 'Linked mission' : 'Link to a mission'}
              </h3>
              <p className="text-muted-foreground text-sm">
                {kind === 'linked' ? 'This row follows that mission’s progress and completes when it is Done.' : 'The row then follows that mission’s progress and completes when it is Done.'}
              </p>
              <LinkForm row={row} kind={kind} choices={linkChoices} action={action} place={place} id={id} />
            </section>
          ) : null}

          {kind !== 'linked' ? (
            <section aria-labelledby={id('copy-heading')} className="soft-divider grid gap-2 pt-5">
              <h3 id={id('copy-heading')} className="text-foreground flex items-center gap-2 text-sm font-bold">
                <CopyIcon className="text-primary size-4" aria-hidden="true" />Duplicate
              </h3>
              <p className="text-muted-foreground text-sm">
                {row.childCount ? 'Copies this row and every row under it' : 'Copies this row'}, right after it, as new work set to No.
              </p>
              <ExecutionForm action={action} scope={`duplicate:${row.id}`}>
                <input type="hidden" name="command" value="duplicate" />
                {hidden}
                <Button type="submit" variant="outline" className="justify-self-start">
                  Duplicate{row.childCount ? ' with its rows' : ''}
                </Button>
              </ExecutionForm>
            </section>
          ) : null}

          <section aria-labelledby={id('remove-heading')} className="soft-divider grid gap-2 pt-5">
            <h3 id={id('remove-heading')} className="text-foreground flex items-center gap-2 text-sm font-bold">
              <Trash2Icon className="text-danger size-4" aria-hidden="true" />Remove
            </h3>
            {kind === 'quest' && row.childCount > 0 ? (
              <p className="text-muted-foreground text-sm">Open the Quest and remove its rows first, then the Quest can be removed.</p>
            ) : (
              <ExecutionForm action={action} scope={`delete:${row.id}`}>
                <input type="hidden" name="command" value="delete" />
                {hidden}
                {kind === 'parent' ? <input type="hidden" name="with_children" value="true" /> : null}
                <div className="grid gap-3">
                  {kind === 'parent' ? (
                    <p className="text-danger text-sm">
                      The {row.childCount} row{row.childCount === 1 ? '' : 's'} under it go too. Time logged on them is kept.
                    </p>
                  ) : null}
                  <Field id={id('remove-reason')} label="Why remove it?" required>
                    <Input id={id('remove-reason')} name="reason" required maxLength={1000} />
                  </Field>
                  <Button type="submit" variant="destructive" className="justify-self-start">
                    {kind === 'parent' ? `Remove row and its ${row.childCount} row${row.childCount === 1 ? '' : 's'}` : kind === 'quest' ? 'Remove Quest' : 'Remove row'}
                  </Button>
                </div>
              </ExecutionForm>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

type Place = (parentId: string | null, linkedTaskId: string | null) => React.ReactNode;

function MoveForm({ row, targets, action, place, id }: {
  row: ChecklistActionRow;
  targets: readonly { id: string | null; title: string }[];
  action: Command;
  place: Place;
  id: (name: string) => string;
}) {
  const [target, setTarget] = React.useState(targets[0]?.id ?? '');
  return (
    <ExecutionForm action={action} scope={`move:${row.id}`}>
      {place(target || null, row.linkedTaskId)}
      <div className="grid gap-3">
        <Field id={id('move-target')} label="Move under">
          <select id={id('move-target')} value={target} onChange={event => setTarget(event.target.value)} className={SELECT}>
            {targets.map(option => <option key={option.id ?? 'top'} value={option.id ?? ''}>{option.title}</option>)}
          </select>
        </Field>
        <Field id={id('move-reason')} label="Why move it?" hint="Kept with the checklist history." required>
          <Input id={id('move-reason')} name="reason" required maxLength={1000} />
        </Field>
        <Button type="submit" variant="outline" className="justify-self-start"><CornerDownRightIcon aria-hidden="true" />Move row</Button>
      </div>
    </ExecutionForm>
  );
}

function LinkForm({ row, kind, choices, action, place, id }: {
  row: ChecklistActionRow;
  kind: 'item' | 'linked';
  choices: readonly { id: string; taskTag: string; title: string }[];
  action: Command;
  place: Place;
  id: (name: string) => string;
}) {
  const [mission, setMission] = React.useState(row.linkedTaskId ?? choices[0]?.id ?? '');
  if (kind === 'item' && !choices.length) return <p className="text-muted-foreground text-sm">No other mission is available to link.</p>;
  return (
    <ExecutionForm action={action} scope={`link:${row.id}`}>
      {place(row.parentNodeId, kind === 'linked' ? null : mission || null)}
      <div className="grid gap-3">
        {kind === 'item' ? (
          <Field id={id('link-mission')} label="Mission">
            <select id={id('link-mission')} value={mission} onChange={event => setMission(event.target.value)} className={SELECT}>
              {choices.map(choice => <option key={choice.id} value={choice.id}>{choice.taskTag} · {choice.title}</option>)}
            </select>
          </Field>
        ) : null}
        <Field id={id('link-reason')} label="Why?" hint="Kept with the checklist history." required>
          <Input id={id('link-reason')} name="reason" required maxLength={1000} />
        </Field>
        <Button type="submit" variant="outline" className="justify-self-start">{kind === 'linked' ? 'Unlink mission' : 'Link mission'}</Button>
      </div>
    </ExecutionForm>
  );
}
