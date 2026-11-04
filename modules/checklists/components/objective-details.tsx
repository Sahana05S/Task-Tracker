'use client';

import * as React from 'react';
import { CheckCircle2Icon, CircleAlertIcon, CircleDashedIcon, CircleDotIcon, CircleMinusIcon, ExternalLinkIcon, FlagIcon, ListTreeIcon, RocketIcon } from 'lucide-react';

import { MissionProgress } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';
import type { ChecklistBranchRow } from '../internal/branch-types';
import type { CompletionState } from '../internal/progress';
import { NOT_DONE, percentText, rowKind, rowStatus, stateChoices, type ProgressStatusTone } from '../internal/table';
import { ChecklistStateBadge, ChecklistStateControl } from './checklist-state-control';
import { ObjectiveReviewChip, ObjectiveReviewNote, useRowChangesNeeded } from './objective-review';
import type { ActionResponse, Task } from '@/types/tracker';

type Command = (form: FormData) => Promise<ActionResponse<unknown>>;

/** What every view hands an objective: the mission, whether the viewer may tick, and the command. */
export interface ObjectiveContext {
  task: Pick<Task, 'id' | 'taskTag' | 'lifecycleVersion'>;
  canEdit: boolean;
  version: number;
  action: Command;
}

const STATUS_ICON: Record<ReturnType<typeof rowStatus>['label'], { icon: typeof CircleDotIcon; className: string }> = {
  'Not applicable': { icon: CircleMinusIcon, className: 'text-muted-foreground' },
  Complete: { icon: CheckCircle2Icon, className: 'text-success-strong' },
  'Changes needed': { icon: CircleAlertIcon, className: 'text-danger' },
  'In progress': { icon: CircleDotIcon, className: 'text-primary' },
  'Not started': { icon: CircleDashedIcon, className: 'text-muted-foreground' },
};
const STATUS_TEXT: Record<ProgressStatusTone, string> = {
  done: 'text-success-strong',
  active: 'text-primary',
  idle: 'text-muted-foreground',
  alert: 'text-danger',
};

/**
 * Where a Quest, a row with rows under it or a sub-mission stands, as an icon
 * (and its words when `label`): Not started at 0%, Changes needed when an
 * objective inside was sent back, In progress once something is done.
 */
export function ObjectiveRowStatus({ row, label = false, className }: { row: ChecklistBranchRow; label?: boolean; className?: string }) {
  const status = rowStatus(row, useRowChangesNeeded(row.id));
  const { icon: Icon, className: tone } = STATUS_ICON[status.label];
  if (!label) return <Icon className={cn('size-4 shrink-0', tone, className)} role="img" aria-label={status.label} />;
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', STATUS_TEXT[status.tone], className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />{status.label}
    </span>
  );
}

/**
 * The tick for any view: Yes / N/A (only N/A on a linked sub-mission) for
 * those who may change it, the state otherwise, then the review chip. Rows
 * with rows under them show where they stand instead.
 */
export function ObjectiveTick({ row, ctx, className }: { row: ChecklistBranchRow; ctx: ObjectiveContext; className?: string }) {
  const choices = stateChoices(rowKind(row));
  if (!choices.length) return <ObjectiveRowStatus row={row} className={className} />;
  const state: CompletionState = row.completionState ?? NOT_DONE;
  return (
    <span className={cn('inline-flex max-w-full flex-wrap items-center gap-2', className)}>
      {ctx.canEdit ? (
        <ChecklistStateControl taskId={ctx.task.id} checklistId={row.checklistId} nodeId={row.id} title={row.title} state={state} choices={choices} version={ctx.version} action={ctx.action} />
      ) : <ChecklistStateBadge state={state} />}
      <ObjectiveReviewChip nodeId={row.id} />
    </span>
  );
}

/** A one-line description that opens to the whole text when it is longer. */
function Description({ text }: { text: string }) {
  const [open, setOpen] = React.useState(false);
  const long = text.length > 90 || text.includes('\n');
  return (
    <div className="flex min-w-0 items-start gap-1.5">
      <p className={cn('text-muted-foreground min-w-0 flex-1 text-xs break-words', open ? 'whitespace-pre-wrap' : 'line-clamp-1')}>{text}</p>
      {long ? (
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="text-primary focus-visible:ring-ring shrink-0 rounded text-xs font-semibold outline-none focus-visible:ring-2">
          {open ? 'Less' : 'More'}
        </button>
      ) : null}
    </div>
  );
}

/** The row's work links as icons that open in a new tab. */
export function ObjectiveLinks({ row, className }: { row: Pick<ChecklistBranchRow, 'title' | 'links'>; className?: string }) {
  if (!row.links.length) return null;
  return (
    <span className={cn('flex flex-wrap items-center gap-1', className)}>
      {row.links.map((url, index) => (
        <a
          key={`${url}:${index}`}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title={url}
          aria-label={`Link ${index + 1} for ${row.title}`}
          className="text-primary hover:bg-primary-subtle focus-visible:ring-ring inline-flex size-8 items-center justify-center rounded-md outline-none focus-visible:ring-2"
        >
          <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
        </a>
      ))}
    </span>
  );
}

/**
 * The same objective details in every checklist view (Table, Board, Blocks,
 * Outline and Today's item work): the description (one line, opens to all),
 * the reviewer's note, what the row is (Quest, sub-mission tag and status,
 * rows inside), its progress and where it stands, and its links. Renders
 * nothing when the row has none of these.
 *
 * `progress={false}` when the view already shows the figure (the Table's
 * Progress column); `links="phone"` when the view has its own Links column on
 * wider screens.
 */
export function ObjectiveDetails({ row, progress = true, links = 'all', className, style }: {
  row: ChecklistBranchRow;
  progress?: boolean;
  links?: 'all' | 'phone';
  className?: string;
  style?: React.CSSProperties;
}) {
  const kind = rowKind(row);
  const count = `${row.childCount} row${row.childCount === 1 ? '' : 's'}`;
  const tag = kind === 'quest' ? { icon: FlagIcon, text: `Quest · ${count}`, tone: 'bg-primary-subtle text-primary-subtle-foreground' }
    : kind === 'linked' ? { icon: RocketIcon, text: ['Sub-mission', row.linkedTaskTag, row.linkedTaskStatus].filter(Boolean).join(' · '), tone: 'badge-accent' }
    : kind === 'parent' ? { icon: ListTreeIcon, text: `${count} inside`, tone: 'badge-neutral' }
    : null;
  const showProgress = progress && kind !== 'item';
  const hasLinks = row.links.length > 0;
  const meta = tag || showProgress || hasLinks;

  return (
    <div className={cn('grid min-w-0 gap-1.5 empty:hidden', className)} style={style}>
      {row.description ? <Description text={row.description} /> : null}
      <ObjectiveReviewNote nodeId={row.id} />
      {meta ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {tag ? (
            <span className={cn('badge-soft max-w-full', tag.tone)}>
              <tag.icon className="size-3 shrink-0" aria-hidden="true" /><span className="truncate">{tag.text}</span>
            </span>
          ) : null}
          {showProgress ? (
            <span className="flex min-w-36 flex-1 items-center gap-2">
              <ObjectiveRowStatus row={row} label />
              <MissionProgress value={row.applicable ? row.progressPercentage : null} label={`${row.title} progress`} className="h-1.5 min-w-12 flex-1" />
              <span className="text-foreground text-xs font-semibold tabular-nums">{row.applicable ? percentText(row.progressPercentage) ?? '—' : 'N/A'}</span>
            </span>
          ) : null}
          {hasLinks ? <ObjectiveLinks row={row} className={links === 'phone' ? 'md:hidden' : undefined} /> : null}
        </div>
      ) : null}
    </div>
  );
}

