import type * as React from 'react';
import Link from 'next/link';
import { ChevronRightIcon, TriangleAlertIcon } from 'lucide-react';

import { MissionProgress } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';
import { rowHref } from '../internal/location';
import type { ChecklistBranchRow } from '../internal/branch-types';
import type { ChecklistSection, SectionProgress } from '../internal/progress';
import { percentText, sectionStatus } from '../internal/table';
import { ChecklistAddRow } from './checklist-add-row';
import { ChecklistRowActions } from './checklist-row-actions';
import { ObjectiveDetails, ObjectiveLinks, ObjectiveTick } from './objective-details';
import type { ActionResponse, Task } from '@/types/tracker';

type Command = (form: FormData) => Promise<ActionResponse<unknown>>;

/** Renders one Quest's timer button; `hero` is the larger one on a Quest's home. */
export type QuestTimerSlot = (quest: { nodeId: string; title: string }, place: 'row' | 'hero') => React.ReactNode;

export interface ChecklistTableProps {
  /** Anchor for links such as the mission page's phase list. */
  id: string;
  title: string;
  note?: string;
  /** Section rollup for the header; omitted on a nested page. */
  summary?: SectionProgress;
  /** An objective in this section was sent back for changes (header says Changes needed). */
  changesNeeded?: boolean;
  rows: readonly ChecklistBranchRow[];
  task: Pick<Task, 'id' | 'taskTag' | 'lifecycleVersion'>;
  version: number;
  checklistId: string;
  section: ChecklistSection;
  /** Where "Add row" puts new rows: the row whose table this is, or the section's top level. */
  addParentId: string | null;
  canEdit: boolean;
  /** `submission` creates a Sub-mission (managers; supplied by the page from the tasks module). */
  actions: { checklist: Command; submission?: Command };
  /** A row id whose menu opens on arrival (old `?item=` links). */
  selectedItem?: string;
  /** Where a row of this table may move: other rows here, and the level above (id null = top level). */
  moveTargets?: readonly { id: string | null; title: string }[];
  /** Missions a manager may link a row to. */
  linkChoices?: readonly { id: string; taskTag: string; title: string }[];
  manager: boolean;
  /**
   * The mission is open and the viewer is Crew or a manager (migration 122): a Quest row's owner
   * gets its menu even where the list around it is read-only for them, and every Quest row gets
   * its timer (migration 123).
   */
  questOwnerEdits?: boolean;
  /** A Quest's Start/Stop timer (migration 123), supplied by the page from the time-tracking module. */
  questTimer?: QuestTimerSlot;
  /** The page's main table: its add row takes the cursor on arrival. */
  autoFocus?: boolean;
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

// One mission timer (update plan, 3 November 2026): the per-row timer and the Est. and
// Elapsed columns are gone; past time per row stays in the row panel and the effort breakdown.

/**
 * One checklist table: the sheet's Checkbox / Progress / Objective / Links
 * columns, with a one-tap completion control and a row
 * menu. A row with rows under it shows their progress and opens their table.
 * On phones each row becomes a two-line card; nothing scrolls sideways.
 */
export function ChecklistTable(props: ChecklistTableProps) {
  const { id, title, note, summary, rows, task, version, checklistId, section, addParentId, canEdit, actions } = props;
  const status = summary ? sectionStatus(summary, props.changesNeeded) : null;
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
                <th scope="col">Objective</th>
                <th scope="col" className="w-0">Links</th>
                <th scope="col" className="w-0"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="max-md:block">
              {rows.map((row) => {
                const href = rowHref(task.taskTag, row);
                const progress = row.applicable ? percentText(row.progressPercentage) : 'N/A';
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      'max-md:border-border max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:items-center max-md:gap-x-3 max-md:gap-y-2 max-md:border-b max-md:px-4 max-md:py-3 max-md:last:border-b-0',
                      row.isComplete && row.applicable && 'bg-success-subtle/40',
                    )}
                  >
                    <td className="max-md:order-3 max-md:border-0 max-md:p-0">
                      <ObjectiveTick row={row} ctx={{ task, canEdit, version, action: actions.checklist }} />
                    </td>
                    <td className="max-md:order-4 max-md:border-0 max-md:p-0">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground w-9 text-right text-xs font-semibold tabular-nums">{progress ?? '—'}</span>
                        <MissionProgress value={row.applicable ? row.progressPercentage : null} label={`${row.title} progress`} className="h-1.5 w-14 max-md:hidden" />
                      </div>
                    </td>
                    <td className="max-md:order-1 max-md:border-0 max-md:p-0 md:min-w-64">
                      {href ? (
                        <Link href={href} className="group text-foreground decoration-primary/40 inline-flex items-center gap-1 font-semibold break-words underline-offset-4 hover:underline">
                          {row.title}
                          <ChevronRightIcon className="row-chevron text-primary size-3.5 shrink-0" aria-hidden="true" />
                        </Link>
                      ) : (
                        <span className="text-foreground font-medium break-words">{row.title}</span>
                      )}
                      {/* The same details as Board, Blocks, Outline and Today; links have their own column on wider screens. */}
                      <ObjectiveDetails row={row} progress={false} links="phone" className="mt-1" />
                    </td>
                    <td className="max-md:hidden">
                      {row.links.length ? <ObjectiveLinks row={row} className="flex-nowrap" /> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="max-md:order-2 max-md:border-0 max-md:p-0">
                      <div className="flex items-center justify-end gap-1">
                        {/* Quests carry the timers (migration 123): the mission's Crew and managers, while it is open. */}
                        {props.questOwnerEdits && row.ownedChecklistId && props.questTimer ? props.questTimer({ nodeId: row.id, title: row.title }, 'row') : null}
                        {canEdit || (props.questOwnerEdits && row.ownedChecklistId && row.canEditQuest) ? (
                          <ChecklistRowActions
                            canEditRow={canEdit}
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
            // Not keyed on the row count: a remount after each add lost the cursor (user report, 28 Oct 2026).
            key={`${checklistId}:${addParentId ?? 'root'}:${section}`}
            taskId={task.id}
            checklistId={checklistId}
            parentId={addParentId}
            section={section}
            version={version}
            action={actions.checklist}
            subMissionAction={actions.submission}
            label={title}
            autoFocus={props.autoFocus}
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
