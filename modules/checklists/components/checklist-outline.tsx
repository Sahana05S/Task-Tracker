'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronRightIcon, FlagIcon, LoaderCircleIcon, RocketIcon } from 'lucide-react';

import { loadChecklistRows } from '@/modules/checklists/actions';
import { cn } from '@/shared/utils';
import type { ActionResponse, Task } from '@/types/tracker';
import type { ChecklistBranchRow } from '../internal/branch-types';
import { checklistWorkHref, openChecklistRow } from '../internal/location';
import { CHECKLIST_SECTIONS, type ChecklistSection, type CompletionState } from '../internal/progress';
import { percentText, rowKind, SECTION_TITLES, stateChoices } from '../internal/table';
import { ChecklistStateBadge, ChecklistStateControl } from './checklist-state-control';

type Command = (form: FormData) => Promise<ActionResponse<unknown>>;
interface Ctx { task: Task; canEdit: boolean; version: number; action: Command }
type Children = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; groups: { section: ChecklistSection | null; rows: ChecklistBranchRow[] }[] };

/**
 * Every level of the checklist as one collapsible tree. Only the level you
 * open is read, so a large checklist stays fast. A Quest opens into its own
 * three phases. Rows tick in place, as in the table.
 */
export function ChecklistOutline({ groups, ctx }: { groups: readonly { section: ChecklistSection; rows: readonly ChecklistBranchRow[] }[]; ctx: Ctx }) {
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
  const choices = stateChoices(kind);
  const state: CompletionState = row.completionState ?? 'No';
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
      <div className="hover:bg-muted/60 flex min-h-11 items-center gap-2 rounded-lg px-1 py-1" style={{ paddingLeft: `${0.25 + depth * 1.25}rem` }}>
        {expandable ? (
          <button type="button" onClick={toggle} aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${row.title}`} className="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex size-7 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-2">
            <ChevronRightIcon className={cn('size-4 transition-transform', open && 'rotate-90')} aria-hidden="true" />
          </button>
        ) : <span className="size-7 shrink-0" aria-hidden="true" />}
        {kind === 'quest' ? <FlagIcon className="text-primary size-4 shrink-0" aria-label="Quest" /> : kind === 'linked' ? <RocketIcon className="text-recognition-foreground size-4 shrink-0" aria-label="Sub-mission" /> : null}
        {expandable ? (
          <Link href={checklistWorkHref(ctx.task.taskTag, openChecklistRow(row))} className="text-foreground min-w-0 flex-1 truncate text-sm font-semibold underline-offset-4 hover:underline">{row.title}</Link>
        ) : (
          <span className={cn('text-foreground min-w-0 flex-1 truncate text-sm', row.isComplete && row.applicable && 'text-muted-foreground line-through decoration-1')}>{row.title}</span>
        )}
        {kind !== 'item' ? <span className="text-muted-foreground w-10 shrink-0 text-right text-xs tabular-nums">{progress ?? '—'}</span> : null}
        {choices.length ? (
          ctx.canEdit
            ? <ChecklistStateControl taskId={ctx.task.id} checklistId={row.checklistId} nodeId={row.id} title={row.title} state={state} choices={choices} version={ctx.version} action={ctx.action} />
            : <ChecklistStateBadge state={state} />
        ) : null}
      </div>
      {open ? (
        children?.state === 'ready' ? (
          children.groups.map((group) => (
            <div key={group.section ?? 'rows'}>
              {group.section ? <p className="text-muted-foreground py-1 text-xs font-semibold tracking-wide uppercase" style={{ paddingLeft: `${2.5 + (depth + 1) * 1.25}rem` }}>{SECTION_TITLES[group.section].title}</p> : null}
              {group.rows.length ? (
                <ul className="grid gap-0.5">{group.rows.map((child) => <OutlineRow key={child.id} row={child} depth={depth + 1} ctx={ctx} />)}</ul>
              ) : <p className="text-muted-foreground py-1 text-xs" style={{ paddingLeft: `${2.5 + (depth + 1) * 1.25}rem` }}>Nothing here yet.</p>}
            </div>
          ))
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
