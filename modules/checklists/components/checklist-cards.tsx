import Link from 'next/link';
import { ChevronRightIcon, CircleCheckIcon, CircleIcon, FlagIcon, ListTreeIcon, RocketIcon } from 'lucide-react';

import { MissionProgress } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';
import type { Task } from '@/types/tracker';
import type { ActionResponse } from '@/types/tracker';
import type { ChecklistBranchRow } from '../internal/branch-types';
import { checklistWorkHref, openChecklistRow } from '../internal/location';
import type { CompletionState, SectionProgress } from '../internal/progress';
import { opensTable, percentText, rowKind, sectionStatus, stateChoices, type ChecklistRowKind } from '../internal/table';
import { ChecklistStateBadge, ChecklistStateControl } from './checklist-state-control';
import { SectionStateIcon } from './section-state-icon';

type Command = (form: FormData) => Promise<ActionResponse<unknown>>;

const KIND: Record<ChecklistRowKind, { label: string; icon: typeof FlagIcon }> = {
  item: { label: 'Item', icon: CircleIcon },
  parent: { label: 'Rows inside', icon: ListTreeIcon },
  quest: { label: 'Quest', icon: FlagIcon },
  linked: { label: 'Sub-mission', icon: RocketIcon },
};

export interface CardContext {
  task: Task;
  canEdit: boolean;
  version: number;
  action: Command;
}

/**
 * One checklist row as a card (Board and Blocks views): kind, title, progress
 * and the same one-tap Yes / No / N/A as the table. Quests, sub-missions and
 * rows with rows under them open their page.
 */
export function ChecklistRowCard({ row, ctx, large = false }: { row: ChecklistBranchRow; ctx: CardContext; large?: boolean }) {
  const kind = rowKind(row);
  const { label, icon: Icon } = KIND[kind];
  const choices = stateChoices(kind);
  const href = opensTable(kind) ? checklistWorkHref(ctx.task.taskTag, openChecklistRow(row)) : null;
  const progress = row.applicable ? percentText(row.progressPercentage) : 'N/A';
  const state: CompletionState = row.completionState ?? 'No';
  const done = row.isComplete && row.applicable;
  const detail = kind === 'parent' ? `${row.childCount} row${row.childCount === 1 ? '' : 's'} inside`
    : kind === 'quest' ? `${row.childCount} Activity row${row.childCount === 1 ? '' : 's'}` : null;

  return (
    <article className={cn('soft-card grid content-start gap-2.5 p-3.5', large && 'sm:p-4', done && 'bg-success-subtle/40')}>
      <div className="flex min-w-0 items-start gap-2.5">
        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', kind === 'quest' ? 'bg-primary-subtle text-primary-subtle-foreground' : kind === 'linked' ? 'bg-recognition-subtle text-recognition-foreground' : 'bg-muted text-muted-foreground')}>
          {done ? <CircleCheckIcon className="text-success-strong size-4" aria-hidden="true" /> : <Icon className="size-4" aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-[0.6875rem] font-semibold tracking-wide uppercase">{label}</p>
          {href ? (
            <Link href={href} className={cn('text-foreground inline-flex items-center gap-1 font-semibold break-words underline-offset-4 hover:underline', large ? 'text-base' : 'text-sm')}>
              {row.title}<ChevronRightIcon className="text-primary size-3.5 shrink-0" aria-hidden="true" />
            </Link>
          ) : (
            <p className={cn('text-foreground font-medium break-words', large ? 'text-base' : 'text-sm')}>{row.title}</p>
          )}
          {detail ? <p className="text-muted-foreground mt-0.5 text-xs">{detail}</p> : null}
        </div>
      </div>
      {kind !== 'item' ? (
        <div className="flex items-center gap-2">
          <MissionProgress value={row.applicable ? row.progressPercentage : null} label={`${row.title} progress`} className="h-1.5 flex-1" />
          <span className="text-foreground w-10 text-right text-xs font-semibold tabular-nums">{progress ?? '—'}</span>
        </div>
      ) : null}
      {choices.length ? (
        ctx.canEdit ? (
          <ChecklistStateControl taskId={ctx.task.id} checklistId={row.checklistId} nodeId={row.id} title={row.title} state={state} choices={choices} version={ctx.version} action={ctx.action} />
        ) : <ChecklistStateBadge state={state} />
      ) : null}
    </article>
  );
}

/** A phase heading with its state and progress, for the Board columns and Blocks groups. */
export function PhaseHeading({ id, title, summary }: { id: string; title: string; summary?: SectionProgress }) {
  const status = summary ? sectionStatus(summary) : null;
  const value = summary?.state === 'not_applicable' ? 'N/A' : percentText(summary?.progressPercentage);
  return (
    <header className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <h2 id={id} className="text-foreground flex items-center gap-2 text-base font-bold tracking-tight">
          {summary ? <SectionStateIcon section={summary} className="size-4" /> : null}{title}
        </h2>
        <span className="text-muted-foreground text-xs tabular-nums">{status?.label}{value ? ` · ${value}` : ''}</span>
      </div>
      <MissionProgress value={summary?.progressPercentage ?? null} label={`${title} progress`} className="h-1.5" />
    </header>
  );
}
