'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronRightIcon, FlagIcon, LoaderCircleIcon, PlusIcon, RocketIcon } from 'lucide-react';

import { loadChecklistRows } from '@/modules/checklists/actions';
import { Button } from '@/shared/ui/button';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { Input } from '@/shared/ui/input';
import { cn } from '@/shared/utils';
import type { ActionResponse, Task } from '@/types/tracker';
import type { ChecklistBranchRow } from '../internal/branch-types';
import { rowHref } from '../internal/location';
import { CHECKLIST_SECTIONS, type ChecklistSection } from '../internal/progress';
import { percentText, rowKind, SECTION_TITLES } from '../internal/table';
import { ChecklistVersionField } from './checklist-state-control';
import { ObjectiveDetails, ObjectiveRowStatus, ObjectiveTick } from './objective-details';

type Command = (form: FormData) => Promise<ActionResponse<unknown>>;
interface Ctx { task: Task; canEdit: boolean; version: number; action: Command }
type Children = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; groups: { section: ChecklistSection | null; rows: ChecklistBranchRow[] }[] };

/**
 * Every level of the checklist as one collapsible tree. Only the level you
 * open is read, so a large checklist stays fast. A Quest opens into its own
 * list. Rows tick in place, as in the table. Each section ends with
 * the same add row as the other views, and an open Quest or row ends with a
 * one-line "Add an objective" (user request, 28 Oct 2026: adding works in every view).
 */
export function ChecklistOutline({ groups, ctx, addRows }: {
  groups: readonly { section: ChecklistSection; rows: readonly ChecklistBranchRow[] }[];
  ctx: Ctx;
  /**
   * Each section's add row (the same one Table, Board and Blocks show), already
   * rendered by the server page: a function cannot cross into this client component.
   */
  addRows?: Partial<Record<ChecklistSection, React.ReactNode>>;
}) {
  return (
    <div className="grid gap-5">
      {groups.map((group) => (
        <section key={group.section} aria-labelledby={`outline-${group.section}`} className="soft-card p-3 sm:p-4">
          <h2 id={`outline-${group.section}`} className="text-foreground mb-2 px-1 text-base font-bold tracking-tight">{SECTION_TITLES[group.section].title}</h2>
          {group.rows.length ? (
            <ul className="grid gap-0.5">
              {group.rows.map((row) => <OutlineRow key={row.id} row={row} depth={0} ctx={ctx} />)}
            </ul>
          ) : <p className="text-muted-foreground px-1 text-sm">No rows yet. An empty section counts as N/A.</p>}
          {addRows?.[group.section] ? <div className="mt-3">{addRows[group.section]}</div> : null}
        </section>
      ))}
    </div>
  );
}

function OutlineRow({ row, depth, ctx }: { row: ChecklistBranchRow; depth: number; ctx: Ctx }) {
  const kind = rowKind(row);
  const expandable = kind === 'parent' || kind === 'quest';
  const [open, setOpen] = React.useState(false);
  const [children, setChildren] = React.useState<Children | null>(null);
  const progress = row.applicable ? percentText(row.progressPercentage) : 'N/A';

  const load = async () => {
    setChildren({ state: 'loading' });
    const reads = kind === 'quest' && row.ownedChecklistId
      ? CHECKLIST_SECTIONS.map((section) => loadChecklistRows(ctx.task.id, { checklistId: row.ownedChecklistId!, section }).then((r) => ({ section, r })))
      : [loadChecklistRows(ctx.task.id, { checklistId: row.checklistId, parentNodeId: row.id, section: row.section ?? 'activity' }).then((r) => ({ section: null, r }))];
    try {
      const results = await Promise.all(reads);
      const failed = results.find((entry) => !entry.r.success);
      if (failed) { setChildren({ state: 'error', message: failed.r.error ?? 'These rows could not be loaded.' }); return; }
      setChildren({ state: 'ready', groups: results.map((entry) => ({ section: entry.section, rows: entry.r.data?.rows ?? [] })) });
    } catch {
      setChildren({ state: 'error', message: 'These rows could not be loaded. Check the connection.' });
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && (!children || children.state === 'error')) void load();
  };

  return (
    <li className="grid">
      <div className="hover:bg-muted/60 flex min-h-11 flex-wrap items-center gap-2 rounded-lg px-1 py-1" style={{ paddingLeft: `${0.25 + depth * 1.25}rem` }}>
        {expandable ? (
          <button type="button" onClick={toggle} aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${row.title}`} className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex size-7 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-2">
            <ChevronRightIcon className={cn('size-4 transition-transform', open && 'rotate-90')} aria-hidden="true" />
          </button>
        ) : <span className="size-7 shrink-0" aria-hidden="true" />}
        {kind === 'quest' ? <FlagIcon className="text-primary size-4 shrink-0" aria-label="Quest" /> : kind === 'linked' ? <RocketIcon className="text-recognition-foreground size-4 shrink-0" aria-label="Sub-mission" /> : null}
        {rowHref(ctx.task.taskTag, row) ? (
          <Link href={rowHref(ctx.task.taskTag, row)!} className="text-foreground min-w-0 flex-1 basis-32 truncate text-sm font-semibold underline-offset-4 hover:underline">{row.title}</Link>
        ) : (
          <span className={cn('text-foreground min-w-0 flex-1 basis-32 truncate text-sm', row.isComplete && row.applicable && 'text-muted-foreground line-through decoration-1')}>{row.title}</span>
        )}
        {kind !== 'item' ? <span className="text-muted-foreground w-10 shrink-0 text-right text-xs tabular-nums">{progress ?? '—'}</span> : null}
        {expandable ? <ObjectiveRowStatus row={row} /> : <ObjectiveTick row={row} ctx={ctx} className="ml-auto shrink-0 justify-end" />}
      </div>
      {/* The same details as the other views, under the title; the percentage is on the line above. */}
      <ObjectiveDetails row={row} progress={false} className="pr-1 pb-1" style={{ paddingLeft: `${2.75 + depth * 1.25}rem` }} />
      {open ? (
        children?.state === 'ready' ? (
          children.groups.map((group) => (
            <div key={group.section ?? 'rows'}>
              {group.section ? <p className="text-muted-foreground py-1 text-xs font-semibold tracking-wide uppercase" style={{ paddingLeft: `${2.5 + (depth + 1) * 1.25}rem` }}>{SECTION_TITLES[group.section].title}</p> : null}
              {group.rows.length ? (
                <ul className="grid gap-0.5">{group.rows.map((child) => <OutlineRow key={child.id} row={child} depth={depth + 1} ctx={ctx} />)}</ul>
              ) : <p className="text-muted-foreground py-1 text-xs" style={{ paddingLeft: `${2.5 + (depth + 1) * 1.25}rem` }}>Nothing here yet.</p>}
            </div>
          )).concat(ctx.canEdit ? [
            <OutlineAddItem
              key="add"
              ctx={ctx}
              // A Quest holds items in its own list (migration 77); a row takes rows under it.
              checklistId={kind === 'quest' ? row.ownedChecklistId! : row.checklistId}
              parentId={kind === 'quest' ? null : row.id}
              section={kind === 'quest' ? 'activity' : row.section ?? 'activity'}
              indent={2.5 + (depth + 1) * 1.25}
              onAdded={() => void load()}
            />,
          ] : [])
        ) : children?.state === 'error' ? (
          <p role="alert" className="text-danger py-1 text-xs" style={{ paddingLeft: `${2.5 + (depth + 1) * 1.25}rem` }}>
            {children.message} <button type="button" className="link font-semibold" onClick={() => void load()}>Retry</button>
          </p>
        ) : (
          <p className="text-muted-foreground flex items-center gap-1.5 py-1 text-xs" style={{ paddingLeft: `${2.5 + (depth + 1) * 1.25}rem` }}>
            <LoaderCircleIcon className="size-3.5 animate-spin" aria-hidden="true" />Loading…
          </p>
        )
      ) : null}
    </li>
  );
}

/** One line to add an objective inside an open Quest or row; the cursor stays for the next one. */
function OutlineAddItem({ ctx, checklistId, parentId, section, indent, onAdded }: {
  ctx: Ctx;
  checklistId: string;
  parentId: string | null;
  section: ChecklistSection;
  indent: number;
  onAdded: () => void;
}) {
  const id = React.useId();
  return (
    <div className="py-1 pr-1" style={{ paddingLeft: `${indent}rem` }}>
      <ExecutionForm action={ctx.action} scope={`outline-add:${checklistId}:${parentId ?? 'root'}`} onSuccess={onAdded}>
        <input type="hidden" name="command" value="add" />
        <input type="hidden" name="checklist_id" value={checklistId} />
        <input type="hidden" name="taskId" value={ctx.task.id} />
        <ChecklistVersionField fallback={ctx.version} />
        <input type="hidden" name="section" value={section} />
        <input type="hidden" name="parent_id" value={parentId ?? ''} />
        <div className="flex items-center gap-2">
          <label htmlFor={id} className="sr-only">New objective</label>
          <Input id={id} name="title" required maxLength={500} placeholder="Add an objective" className="bg-card h-8 min-w-40 flex-1 text-sm" />
          <Button type="submit" size="sm" variant="outline" className="h-8"><PlusIcon aria-hidden="true" />Add</Button>
        </div>
      </ExecutionForm>
    </div>
  );
}
