import type * as React from 'react';
import Link from 'next/link';
import { CheckCircle2Icon, ChevronRightIcon, CircleDashedIcon, CircleDotIcon, CircleMinusIcon, ExternalLinkIcon, TriangleAlertIcon, FlagIcon, RocketIcon } from 'lucide-react';

import { MissionProgress } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';
import { checklistWorkHref, openChecklistRow } from '../internal/location';
import { formatMinutes } from '../internal/pages';
import type { ChecklistBranchRow } from '../internal/branch-types';
import type { ChecklistItemTime } from '../internal/item-time';
import type { ChecklistSection, CompletionState, SectionProgress } from '../internal/progress';
import { opensTable, percentText, rowKind, sectionStatus, stateChoices } from '../internal/table';
import { ChecklistAddRow } from './checklist-add-row';
import { ChecklistRowActions } from './checklist-row-actions';
import { ItemTimerControls } from './checklist-rows';
import { ChecklistStateBadge, ChecklistStateControl } from './checklist-state-control';
import type { ActionResponse, Task } from '@/types/tracker';

type Command = (form: FormData) => Promise<ActionResponse<unknown>>;

export interface ChecklistTableProps {
  /** Anchor for links such as the mission page's phase list. */
  id: string;
  title: string;
  note?: string;
  /** Section rollup for the header; omitted on a nested page. */
  summary?: SectionProgress;
  rows: readonly ChecklistBranchRow[];
  task: Pick<Task, 'id' | 'taskTag' | 'lifecycleVersion'>;
  version: number;
  checklistId: string;
  section: ChecklistSection;
  /** Where "Add row" puts new rows: the row whose table this is, or the section's top level. */
  addParentId: string | null;
  canEdit: boolean;
  /** Not archived, Done or Discarded: timers may start. */
  open: boolean;
  canTime: boolean;
  time?: ChecklistItemTime;
  /** `submission` creates a Sub-mission (managers; supplied by the page from the tasks module). */
  actions: { checklist: Command; start: Command; stop: Command; discard: Command; submission?: Command };
  /** A row id whose menu opens on arrival (old `?item=` links). */
  selectedItem?: string;
  /** Where a row of this table may move: other rows here, and the level above (id null = top level). */
  moveTargets?: readonly { id: string | null; title: string }[];
  /** Missions a manager may link a row to. */
  linkChoices?: readonly { id: string; taskTag: string; title: string }[];
  manager: boolean;
  /** Header control. */
  headerAction?: React.ReactNode;
  /** Paging links under the table. */
  footer?: React.ReactNode;
  emptyText: string;
}

const STATUS_TONE = {
  done: 'badge-status-done',
  active: 'badge-accent',
  idle: 'badge-neutral',
  alert: 'bg-danger-subtle text-danger',
} as const;

function RollupIcon({ row }: { row: ChecklistBranchRow }) {
  if (!row.applicable) return <CircleMinusIcon className="text-muted-foreground size-4" aria-label="Not applicable" />;
  if (row.isComplete) return <CheckCircle2Icon className="text-success-strong size-4" aria-label="Complete" />;
  if ((row.progressPercentage ?? 0) > 0) return <CircleDotIcon className="text-primary size-4" aria-label="In progress" />;
  return <CircleDashedIcon className="text-muted-foreground size-4" aria-label="Not started" />;
}

function rowMeta(inside: string | null, estimate: string | null, elapsed: string | null): string {
  return [inside, estimate ? `Est. ${estimate}` : null, elapsed ? `${elapsed} logged` : null]
    .filter(Boolean)
    .join(' · ');
}

/**
 * One checklist table: the sheet's Checkbox / Progress / Item / Links /
 * Estimated / Elapsed columns, with a one-tap completion control and a row
 * menu. A row with rows under it shows their progress and opens their table.
 * On phones each row becomes a two-line card; nothing scrolls sideways.
 */
export function ChecklistTable(props: ChecklistTableProps) {
  const { id, title, note, summary, rows, task, version, checklistId, section, addParentId, canEdit, open, canTime, time, actions } = props;
  const status = summary ? sectionStatus(summary) : null;
  const summaryValue = summary && summary.state !== 'not_applicable' ? summary.progressPercentage : null;
  const headingId = `${id}-heading`;

  return (
    <section id={id} aria-labelledby={headingId} className="soft-card-clip scroll-mt-24">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 sm:px-5">
        <div className="min-w-0 flex-1 basis-56">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={headingId} className="text-foreground text-base font-bold tracking-tight">{title}</h2>
            {status ? <span className={cn('badge-soft', STATUS_TONE[status.tone])}>{status.label}</span> : null}
          </div>
          {note ? <p className="text-muted-foreground mt-0.5 text-xs">{note}</p> : null}
        </div>
        {summary ? (
          <div className="flex w-full items-center gap-3 sm:w-56">
            <MissionProgress value={summaryValue} label={`${title} progress`} className="h-1.5 flex-1" />
            <span className="text-foreground w-11 text-right text-sm font-bold tabular-nums">{percentText(summaryValue) ?? '—'}</span>
          </div>
        ) : null}
        {props.headerAction}
      </header>

      {rows.length ? (
        <div className="md:overflow-x-auto">
          <table className="sheet-grid max-md:block">
            <caption className="sr-only">{title} rows</caption>
            <thead className="max-md:hidden">
              <tr>
                <th scope="col" className="w-0">Done</th>
                <th scope="col" className="w-0">Progress</th>
                <th scope="col">Item</th>
                <th scope="col" className="w-0">Links</th>
                <th scope="col" className="w-0 text-right">Est.</th>
                <th scope="col" className="w-0 text-right">Elapsed</th>
                <th scope="col" className="w-0"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="max-md:block">
              {rows.map((row) => {
                const kind = rowKind(row);
                const choices = stateChoices(kind);
                const container = choices.length === 0;
                const href = opensTable(kind) ? checklistWorkHref(task.taskTag, openChecklistRow(row)) : null;
                const progress = row.applicable ? percentText(row.progressPercentage) : 'N/A';
                const estimate = formatMinutes(row.estimatedMinutes);
                const elapsed = row.elapsedSeconds > 0 ? formatMinutes(Math.max(1, Math.round(row.elapsedSeconds / 60))) : null;
                const inside = kind === 'parent' ? `${row.childCount} row${row.childCount === 1 ? '' : 's'} inside`
                  : kind === 'quest' ? `Quest · ${row.childCount} Activity row${row.childCount === 1 ? '' : 's'}`
                  : kind === 'linked' ? 'Sub-mission' : null;
                const state: CompletionState = row.completionState ?? 'No';
                const timerHere = kind === 'item' && time?.available && ((canTime && open) || time.runningByNode.has(row.id));
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      'max-md:border-border max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:items-center max-md:gap-x-3 max-md:gap-y-2 max-md:border-b max-md:px-4 max-md:py-3 max-md:last:border-b-0',
                      row.isComplete && row.applicable && 'bg-success-subtle/40',
                    )}
                  >
                    <td className="max-md:order-3 max-md:border-0 max-md:p-0">
                      {container ? (
                        <RollupIcon row={row} />
                      ) : canEdit ? (
                        <ChecklistStateControl
                          taskId={task.id}
                          checklistId={row.checklistId}
                          nodeId={row.id}
                          title={row.title}
                          state={state}
                          choices={choices}
                          version={version}
                          action={actions.checklist}
                        />
                      ) : (
                        <ChecklistStateBadge state={state} />
                      )}
                    </td>
                    <td className="max-md:order-4 max-md:border-0 max-md:p-0">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground w-9 text-right text-xs font-semibold tabular-nums">{progress ?? '—'}</span>
                        <MissionProgress value={row.applicable ? row.progressPercentage : null} label={`${row.title} progress`} className="h-1.5 w-14 max-md:hidden" />
                      </div>
                    </td>
                    <td className="max-md:order-1 max-md:border-0 max-md:p-0 md:min-w-64">
                      {href ? (
                        <Link href={href} className="text-foreground decoration-primary/40 inline-flex items-center gap-1 font-semibold break-words underline-offset-4 hover:underline">
                          {row.title}
                          <ChevronRightIcon className="text-primary size-3.5 shrink-0" aria-hidden="true" />
                        </Link>
                      ) : (
                        <span className="text-foreground font-medium break-words">{row.title}</span>
                      )}
                      {row.description ? <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs break-words">{row.description}</p> : null}
                      {rowMeta(inside, estimate, elapsed) ? <p className="text-muted-foreground mt-0.5 text-xs md:hidden">{rowMeta(inside, estimate, elapsed)}</p> : null}
                      {inside ? (
                        <p className="mt-0.5 text-xs max-md:hidden">
                          {kind === 'linked' || kind === 'quest' ? <span className={cn('badge-soft', kind === 'quest' ? 'bg-primary-subtle text-primary-subtle-foreground' : 'badge-accent')}>{kind === 'quest' ? <FlagIcon className="size-3" aria-hidden="true" /> : <RocketIcon className="size-3" aria-hidden="true" />}{inside}</span> : <span className="text-muted-foreground">{inside}</span>}
                        </p>
                      ) : null}
                    </td>
                    <td className="max-md:hidden">
                      {row.links.length ? (
                        <span className="flex items-center gap-1">
                          {row.links.map((url, index) => (
                            <a
                              key={`${url}:${index}`}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={url}
                              aria-label={`Link ${index + 1} for ${row.title}`}
                              className="text-primary hover:bg-primary-subtle inline-flex size-7 items-center justify-center rounded-md"
                            >
                              <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
                            </a>
                          ))}
                        </span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="sheet-numeric whitespace-nowrap max-md:hidden">{estimate ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="sheet-numeric whitespace-nowrap max-md:hidden">{elapsed ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="max-md:order-2 max-md:border-0 max-md:p-0">
                      <div className="flex items-center justify-end gap-1">
                        {timerHere && time ? (
                          <ItemTimerControls ctx={{ task, open, time: { info: time, canStart: canTime, start: actions.start, stop: actions.stop, discard: actions.discard } }} node={row} compact />
                        ) : null}
                        {canEdit ? (
                          <ChecklistRowActions
                            row={row}
                            taskId={task.id}
                            version={version}
                            action={actions.checklist}
                            defaultOpen={props.selectedItem === row.id}
                            manager={props.manager}
                            moveTargets={props.moveTargets?.filter(target => target.id !== row.id) ?? []}
                            linkChoices={props.linkChoices ?? []}
                          />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-muted-foreground border-border border-t px-4 py-4 text-sm sm:px-5">{props.emptyText}</p>
      )}
      {props.footer}
      {canEdit ? (
        <div className="border-border border-t px-4 py-3 sm:px-5">
          <ChecklistAddRow
            key={`${checklistId}:${addParentId ?? 'root'}:${section}:${rows.length}`}
            taskId={task.id}
            checklistId={checklistId}
            parentId={addParentId}
            section={section}
            version={version}
            action={actions.checklist}
            subMissionAction={actions.submission}
            label={title}
          />
        </div>
      ) : null}
    </section>
  );
}

/** Rollup issues as an alert, in words rather than codes. */
export function ChecklistIssues({ issues }: { issues: readonly string[] }) {
  if (!issues.length) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-2xl border border-danger-border bg-danger-subtle px-4 py-3 text-sm text-danger-foreground">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-semibold">Fix these before the checklist can count:</p>
        <ul className="mt-1 list-disc pl-5">{issues.map(issue => <li key={issue}>{issue}</li>)}</ul>
      </div>
    </div>
  );
}
