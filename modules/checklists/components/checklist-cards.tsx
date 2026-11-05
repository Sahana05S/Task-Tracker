import Link from 'next/link';
import { ChevronRightIcon, CircleCheckIcon, CircleIcon, FlagIcon, ListTreeIcon, RocketIcon } from 'lucide-react';

import { MissionProgress } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';
import type { Task } from '@/types/tracker';
import type { ActionResponse } from '@/types/tracker';
import type { ChecklistBranchRow } from '../internal/branch-types';
import { rowHref } from '../internal/location';
import type { SectionProgress } from '../internal/progress';
import { percentText, rowKind, sectionStatus, type ChecklistRowKind } from '../internal/table';
import { ObjectiveDetails, ObjectiveTick } from './objective-details';
import { SectionStateIcon } from './section-state-icon';

type Command = (form: FormData) => Promise<ActionResponse<unknown>>;

const KIND: Record<ChecklistRowKind, { label: string; icon: typeof FlagIcon }> = {
  item: { label: 'Objective', icon: CircleIcon },
  parent: { label: 'Rows inside', icon: ListTreeIcon },
  quest: { label: 'Quest', icon: FlagIcon },
  linked: { label: 'Sub-mission', icon: RocketIcon },
};

export interface CardContext {
  task: Task;
  canEdit: boolean;
  version: number;
  action: Command;
  /** The mission is open and the viewer is Crew or a manager (Outline: inside a Quest its owner decides, migration 122). */
  crewEdits?: boolean;
}

/**
 * One checklist row as a card (Board and Blocks views): kind, title, the same
 * details as every view (description, review note, links, sub-mission tag,
 * progress) and the same one-tap Yes / N/A as the table. Quests, sub-missions
 * and rows with rows under them open their page.
 */
export function ChecklistRowCard({ row, ctx, large = false }: { row: ChecklistBranchRow; ctx: CardContext; large?: boolean }) {
  const kind = rowKind(row);
  const { label, icon: Icon } = KIND[kind];
  const href = rowHref(ctx.task.taskTag, row);
  const done = row.isComplete && row.applicable;

  return (
    <article className={cn('soft-card grid content-start gap-2.5 p-3.5', large && 'sm:p-4', done && 'bg-success-subtle/40')}>
      <div className="flex min-w-0 items-start gap-2.5">
        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', kind === 'quest' ? 'bg-primary-subtle text-primary-subtle-foreground' : kind === 'linked' ? 'bg-recognition-subtle text-recognition-foreground' : 'bg-muted text-muted-foreground')}>
          {done ? <CircleCheckIcon className="text-success-strong size-4" aria-hidden="true" /> : <Icon className="size-4" aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-[0.6875rem] font-semibold tracking-wide uppercase">{label}</p>
          {href ? (
            <Link href={href} className={cn('group text-foreground inline-flex items-center gap-1 font-semibold break-words underline-offset-4 hover:underline', large ? 'text-base' : 'text-sm')}>
              {row.title}<ChevronRightIcon className="row-chevron text-primary size-3.5 shrink-0" aria-hidden="true" />
            </Link>
          ) : (
            <p className={cn('text-foreground font-medium break-words', large ? 'text-base' : 'text-sm')}>{row.title}</p>
          )}
        </div>
      </div>
      <ObjectiveDetails row={row} />
      {kind === 'item' || kind === 'linked' ? <ObjectiveTick row={row} ctx={ctx} /> : null}
    </article>
  );
}

/** A phase heading with its state and progress, for the Board columns and Blocks groups. */
export function PhaseHeading({ id, title, summary, changesNeeded = false }: { id: string; title: string; summary?: SectionProgress; changesNeeded?: boolean }) {
  const status = summary ? sectionStatus(summary, changesNeeded) : null;
  const value = summary?.state === 'not_applicable' ? 'N/A' : percentText(summary?.progressPercentage);
  return (
    <header className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <h2 id={id} className="text-foreground flex items-center gap-2 text-base font-bold tracking-tight">
          {summary ? <SectionStateIcon section={summary} changesNeeded={changesNeeded} className="size-4" /> : null}{title}
        </h2>
        <span className={cn('text-xs tabular-nums', status?.tone === 'alert' ? 'text-danger font-semibold' : 'text-muted-foreground')}>{status?.label}{value ? ` · ${value}` : ''}</span>
      </div>
      <MissionProgress value={summary?.progressPercentage ?? null} label={`${title} progress`} className="h-1.5" />
    </header>
  );
}
