'use client';

import * as React from 'react';
import Link from 'next/link';
import { CopyIcon, ExternalLinkIcon, MoreHorizontalIcon, PencilIcon, Trash2Icon } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { Field } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/shared/ui/sheet';
import { formatMinutes } from '../internal/pages';
import { ROW_KIND_LABELS, rowKind } from '../internal/table';
import type { ChecklistBranchRow } from '../internal/branch-types';
import { ChecklistVersionField } from './checklist-state-control';
import type { ActionResponse } from '@/types/tracker';

type Command = (form: FormData) => Promise<ActionResponse<unknown>>;

/** The serialisable part of a row the sheet needs. */
export type ChecklistActionRow = Pick<ChecklistBranchRow,
  'id' | 'checklistId' | 'parentNodeId' | 'nodeType' | 'title' | 'description' | 'section' | 'links'
  | 'estimatedMinutes' | 'elapsedSeconds' | 'isSubMission' | 'childCount' | 'linkedTaskId'>;

/**
 * The row menu: details, then rename / links / estimate, duplicate and remove.
 * Built on the client from the row itself, so a closed menu adds nothing to
 * the page. Changes that move a row, map it or link a real mission stay on the
 * manager's structure page.
 */
export function ChecklistRowActions({
  row,
  taskId,
  version,
  action,
  defaultOpen = false,
  structureHref,
}: {
  row: ChecklistActionRow;
  taskId: string;
  version: number;
  action: Command;
  defaultOpen?: boolean;
  /** Managers only: where mapping and linked missions are changed. */
  structureHref?: string;
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

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="size-8 rounded-lg" aria-label={`More for ${row.title}`}>
          <MoreHorizontalIcon aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="pr-12">
          <p className="text-muted-foreground text-xs font-semibold">{ROW_KIND_LABELS[kind]}</p>
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

          {row.linkedTaskId ? (
            <p className="text-muted-foreground text-sm">
              This row follows a linked mission, so it is changed on the structure page.
            </p>
          ) : (
            <section aria-labelledby={id('edit-heading')} className="grid gap-3">
              <h3 id={id('edit-heading')} className="text-foreground flex items-center gap-2 text-sm font-bold">
                <PencilIcon className="text-primary size-4" aria-hidden="true" />Edit
              </h3>
              <ExecutionForm action={action} scope={`edit:${row.id}`}>
                <input type="hidden" name="command" value="edit" />
                {hidden}
                <input type="hidden" name="section" value={row.section ?? ''} />
                <input type="hidden" name="parent_id" value={row.parentNodeId ?? ''} />
                <input type="hidden" name="linked_task_id" value="" />
                <input type="hidden" name="node_type" value={row.nodeType} />
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
                  <Button type="submit" className="justify-self-start rounded-xl">Save changes</Button>
                </div>
              </ExecutionForm>
            </section>
          )}

          {!row.isSubMission && !row.linkedTaskId ? (
            <section aria-labelledby={id('copy-heading')} className="soft-divider grid gap-2 pt-5">
              <h3 id={id('copy-heading')} className="text-foreground flex items-center gap-2 text-sm font-bold">
                <CopyIcon className="text-primary size-4" aria-hidden="true" />Duplicate
              </h3>
              <p className="text-muted-foreground text-sm">
                {row.childCount ? 'Copies this page and every row inside it' : 'Copies this row'}, right after it, as new work set to No.
              </p>
              <ExecutionForm action={action} scope={`duplicate:${row.id}`}>
                <input type="hidden" name="command" value="duplicate" />
                {hidden}
                <Button type="submit" variant="outline" className="justify-self-start rounded-xl">
                  Duplicate{row.childCount ? ' with its rows' : ''}
                </Button>
              </ExecutionForm>
            </section>
          ) : null}

          <section aria-labelledby={id('remove-heading')} className="soft-divider grid gap-2 pt-5">
            <h3 id={id('remove-heading')} className="text-foreground flex items-center gap-2 text-sm font-bold">
              <Trash2Icon className="text-danger size-4" aria-hidden="true" />Remove
            </h3>
            {row.childCount === 0 ? (
              <ExecutionForm action={action} scope={`delete:${row.id}`}>
                <input type="hidden" name="command" value="delete" />
                {hidden}
                <div className="grid gap-3">
                  <Field id={id('remove-reason')} label="Why remove it?" required>
                    <Input id={id('remove-reason')} name="reason" required maxLength={1000} />
                  </Field>
                  <Button type="submit" variant="destructive" className="justify-self-start rounded-xl">
                    Remove {row.isSubMission ? 'Sub-mission' : 'row'}
                  </Button>
                </div>
              </ExecutionForm>
            ) : (
              <p className="text-muted-foreground text-sm">
                Remove the rows inside first, then this {row.isSubMission ? 'Sub-mission' : 'page'} can be removed.
              </p>
            )}
          </section>

          {structureHref ? (
            <Link href={structureHref} className="link soft-divider pt-5 text-sm font-semibold">
              Move, map or link this row on the structure page
            </Link>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
