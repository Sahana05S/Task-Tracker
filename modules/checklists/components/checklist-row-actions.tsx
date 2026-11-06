'use client';

import * as React from 'react';
import { NotebookPenIcon, CopyIcon, ExternalLinkIcon, Link2Icon, MoreHorizontalIcon, PencilIcon, Trash2Icon, ArrowDownIcon, ArrowUpIcon } from 'lucide-react';

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
import { AssignQuestForm } from './quest-owner';
import { useQuestNotes } from './quest-notes';
import { QuestNotesSheet } from '@/modules/learning/components/quest-notes-sheet';
import type { ActionResponse } from '@/types/tracker';

type Command = (form: FormData) => Promise<ActionResponse<unknown>>;

/** The serialisable part of a row the sheet needs. */
export type ChecklistActionRow = Pick<ChecklistBranchRow,
  'id' | 'checklistId' | 'parentNodeId' | 'nodeType' | 'title' | 'description' | 'section' | 'links'
  | 'estimatedMinutes' | 'elapsedSeconds' | 'childCount' | 'linkedTaskId'>
  & Partial<Pick<ChecklistBranchRow, 'ownedChecklistId' | 'assigneeId' | 'canEditQuest'>>;

type LinkChoice = { id: string; taskTag: string; title: string };

/**
 * The row menu wherever a view shows a row (Table, Board, Blocks, Outline; user request,
 * 6 November 2026): shown when the viewer may change rows here, or to a Quest's owner on its Quest.
 */
export function ChecklistRowMenu({ row, ctx }: {
  row: ChecklistActionRow & Pick<ChecklistBranchRow, 'nodeType'>;
  ctx: {
    task: { id: string };
    canEdit: boolean;
    crewEdits?: boolean;
    version: number;
    action: Command;
    manager?: boolean;
    linkChoices?: readonly LinkChoice[];
    selectedItem?: string;
  };
}) {
  // A viewer who may not change the row still gets a Quest's Notes (migration 132).
  const editable = !!(ctx.canEdit || (ctx.crewEdits && row.ownedChecklistId && row.canEditQuest));
  if (!editable && !row.ownedChecklistId) return null;
  return (
    <ChecklistRowActions
      readOnly={!editable}
      canEditRow={ctx.canEdit}
      row={row}
      taskId={ctx.task.id}
      version={ctx.version}
      action={ctx.action}
      defaultOpen={ctx.selectedItem === row.id}
      manager={!!ctx.manager}
      linkChoices={ctx.linkChoices ?? []}
    />
  );
}

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
  linkChoices,
  canEditRow = true,
  readOnly = false,
}: {
  row: ChecklistActionRow;
  taskId: string;
  version: number;
  action: Command;
  defaultOpen?: boolean;
  manager: boolean;
  /** Missions a manager may link this row to. */
  linkChoices: readonly { id: string; taskTag: string; title: string }[];
  /**
   * Whether the viewer may change rows in this row's list (migration 122). When not, a Quest's
   * owner still gets its rename, order, assignment and removal; nothing else is offered.
   */
  canEditRow?: boolean;
  /** The viewer may not change this row: only a Quest's Notes are offered (the ⋯ opens them directly). */
  readOnly?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const kind = rowKind(row);
  // Quest notes (migration 132): a "Notes" item on every Quest row; `?notes=<row id>` opens them on arrival.
  const notes = useQuestNotes();
  const hasNotes = kind === 'quest' && notes.counts !== null;
  const [notesOpen, setNotesOpen] = React.useState(hasNotes && notes.openNodeId === row.id);
  const notesSheet = hasNotes ? (
    <QuestNotesSheet open={notesOpen} onOpenChange={setNotesOpen} taskId={taskId} nodeId={row.id} title={row.title} />
  ) : null;
  if (readOnly) {
    return hasNotes ? (
      <>
        <Button type="button" variant="ghost" size="icon" className="size-8 rounded-lg" aria-label={`Notes on ${row.title}`} onClick={() => setNotesOpen(true)}>
          <MoreHorizontalIcon aria-hidden="true" />
        </Button>
        {notesSheet}
      </>
    ) : null;
  }
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
  // A Quest's owner and the owners above it assign it (migration 122).
  const canAssign = kind === 'quest' && row.canEditQuest !== false;
  const summary = kind === 'parent' ? `${row.childCount} row${row.childCount === 1 ? '' : 's'} inside` : kind === 'linked' ? 'Follows a linked mission' : 'Row';

  return (
    <>
    {notesSheet}
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
            {/* Time is kept by the mission timer (3 November 2026); time logged on this row before then stays shown. */}
            {logged ? `${logged} logged on this row` : 'Time is kept by the mission timer'}
          </SheetDescription>
        </SheetHeader>

        <div className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto px-5 py-5">
          {hasNotes ? (
            <Button type="button" variant="outline" className="justify-self-start" onClick={() => { setOpen(false); setNotesOpen(true); }}>
              <NotebookPenIcon aria-hidden="true" />Notes{notes.counts?.[row.id] ? ` (${notes.counts[row.id]})` : ''}
            </Button>
          ) : null}
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

          {canAssign ? <AssignQuestForm row={row} taskId={taskId} version={version} action={action} /> : null}

          {/* No 'Add a row under this' (130, user decision 6 November 2026): rows go into a Quest instead. */}

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
                <Button type="submit" className="justify-self-start">Save changes</Button>
              </div>
            </ExecutionForm>
          </section>


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

          {canEditRow && kind !== 'linked' ? (
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
            <ExecutionForm action={action} scope={`delete:${row.id}`}>
              <input type="hidden" name="command" value="delete" />
              {hidden}
              {row.childCount > 0 && (kind === 'parent' || kind === 'quest') ? <input type="hidden" name="with_children" value="true" /> : null}
              <div className="grid gap-3">
                {kind === 'parent' ? (
                  <p className="text-danger text-sm">
                    The {row.childCount} row{row.childCount === 1 ? '' : 's'} under it go too. Time logged on them is kept.
                  </p>
                ) : kind === 'quest' && row.childCount > 0 ? (
                  <p className="text-danger text-sm">
                    Everything in the Quest goes too: its {row.childCount} row{row.childCount === 1 ? '' : 's'} and any sub-quests inside them.
                    Sub-missions stay as missions of their own, and time logged is kept.
                  </p>
                ) : null}
                {/* No reason box (user decision, 6 November 2026): the command still needs one, so the row's title is kept as it. */}
                <input type="hidden" name="reason" value={row.title.slice(0, 1000)} />
                <Button type="submit" variant="destructive" className="justify-self-start">
                  {kind === 'parent' ? `Remove row and its ${row.childCount} row${row.childCount === 1 ? '' : 's'}` : kind === 'quest' ? 'Remove Quest' : 'Remove row'}
                </Button>
              </div>
            </ExecutionForm>
          </section>
        </div>
      </SheetContent>
    </Sheet>
    </>
  );
}

type Place = (parentId: string | null, linkedTaskId: string | null) => React.ReactNode;

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
        <Button type="submit" variant="outline" className="justify-self-start">{kind === 'linked' ? 'Unlink mission' : 'Link mission'}</Button>
      </div>
    </ExecutionForm>
  );
}
