import Link from 'next/link';
import { ClipboardCheckIcon, FileStackIcon, GaugeIcon } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { Field } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { AvatarStack, MissionPage, MissionProgress } from '@/shared/ui/mission-ui';
import { Breadcrumb, type BreadcrumbItem } from '@/shared/ui/page-nav';
import { cn } from '@/shared/utils';
import { checklistWorkHref } from '../internal/location';
import { CHECKLIST_SECTIONS, type ChecklistRollup, type ChecklistSection } from '../internal/progress';
import type { ChecklistAncestor, ChecklistBranchRow } from '../internal/branch-types';
import type { ChecklistItemTime } from '../internal/item-time';
import { SECTION_TITLES, checklistIssues, pageResult, percentText } from '../internal/table';
import { ChecklistSheetButton } from './checklist-sheet-button';
import { SectionStateIcon } from './section-state-icon';
import { ChecklistVersionField, ChecklistVersionProvider } from './checklist-state-control';
import { ChecklistIssues, ChecklistTable } from './checklist-table';
import type { ActionResponse, Task } from '@/types/tracker';

type Command = (form: FormData) => Promise<ActionResponse<unknown>>;

export interface ChecklistHomeSection {
  section: ChecklistSection;
  rows: ChecklistBranchRow[];
  cursor: number;
  nextCursor: number | null;
}

export interface ChecklistPageView {
  nodeId: string;
  section: ChecklistSection;
  rows: ChecklistBranchRow[];
  cursor: number;
  nextCursor: number | null;
}

export interface ChecklistWorkspaceProps {
  task: Task;
  ownerNames: readonly string[];
  checklist: { id: string; title: string } | null;
  ancestors: readonly ChecklistAncestor[];
  rollup: ChecklistRollup;
  version: number;
  /** The checklist home: Setup, Activity and Closure tables. */
  sections?: readonly ChecklistHomeSection[];
  /** A nested page: one table of its rows. */
  page?: ChecklistPageView;
  manager: boolean;
  executor: boolean;
  canTime: boolean;
  time?: ChecklistItemTime;
  selectedItem?: string;
  /** Managers: where progress comes from, missions to link, and rows that still need a section. */
  managerTools?: {
    activityDrivesProgress: boolean;
    linkChoices: readonly { id: string; taskTag: string; title: string }[];
    unmapped: readonly { id: string; title: string }[];
  };
  actions: { checklist: Command; start: Command; stop: Command; discard: Command };
  /** Beside the breadcrumb: the mission's own actions, supplied by the page. */
  headerActions?: React.ReactNode;
}

const PAGE_SIZE = 50;

function ancestorHref(taskTag: string, ancestor: ChecklistAncestor, section: ChecklistSection) {
  return checklistWorkHref(taskTag, { checklistId: ancestor.checklistId, parentNodeId: ancestor.nodeId, section });
}

/** Move choices for rows of one table: the level above, then the other rows here. */
function moveTargets(rows: readonly ChecklistBranchRow[], up: { id: string | null; title: string } | null) {
  return [...(up ? [up] : []), ...rows.filter(row => !row.linkedTaskId && row.nodeType !== 'Task').map(row => ({ id: row.id, title: row.title }))];
}

/**
 * The master checklist (the sheet's Checklist Home and "[ChL]" tabs). The
 * home shows Setup, Activity and Closure as three tables; any row with rows
 * under it opens their table with a breadcrumb back. Every figure is the
 * authoritative branch rollup; Activity drives progress and Setup / Closure
 * are completion gates.
 */
export function ChecklistWorkspace(props: ChecklistWorkspaceProps) {
  const { task, checklist, ancestors, rollup, version, manager, executor } = props;
  const open = !task.archivedEffectiveDate && !['Done', 'Discarded'].includes(task.status);
  const canEdit = executor && open;
  const missionHref = `/tasks/${encodeURIComponent(task.taskTag)}`;
  const homeHref = checklistWorkHref(task.taskTag);
  const section = props.page?.section ?? 'activity';
  // On a page the last ancestor is the page itself.
  const trail = props.page ? ancestors.slice(0, -1) : ancestors;
  const current = props.page ? ancestors.at(-1) : undefined;
  // A row's table goes back to the table that holds it.
  const backHref = props.page
    ? (trail.length ? ancestorHref(task.taskTag, trail[trail.length - 1], section) : homeHref)
    : missionHref;
  const tools = manager && open ? props.managerTools : undefined;
  const crumbs: BreadcrumbItem[] = [
    { label: task.taskTag, href: missionHref, tag: true },
    { label: 'Master checklist', href: homeHref },
    ...ancestors.map((ancestor, index) => ({
      label: ancestor.title,
      href: ancestorHref(task.taskTag, ancestor, section),
      hideOnPhone: index < ancestors.length - 2 })),
  ];
  const tableActions = { checklist: props.actions.checklist, start: props.actions.start, stop: props.actions.stop, discard: props.actions.discard };
  const shared = { manager, linkChoices: tools?.linkChoices ?? [] };
  const issues = checklistIssues(rollup.errors);

  return (
    <ChecklistVersionProvider version={version}>
      <MissionPage>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <Breadcrumb back={{ href: backHref, label: 'Back' }} items={crumbs} />
          {props.headerActions ? <div className="flex shrink-0 items-center gap-2">{props.headerActions}</div> : null}
        </div>

        {checklist && props.sections ? (
          <HomeHero {...props} checklist={checklist} tools={tools} />
        ) : checklist && props.page ? (
          <PageHero rollup={rollup} page={props.page} title={current?.title ?? 'Checklist page'} parentTitle={trail.at(-1)?.title ?? checklist.title} />
        ) : null}

        <ChecklistIssues issues={issues} />
        {checklist && tools?.unmapped.length ? (
          <NeedsMapping task={task} checklistId={checklist.id} rows={tools.unmapped} version={version} action={props.actions.checklist} />
        ) : null}

        {!checklist ? (
          <NoChecklist task={task} version={version} canCreate={canEdit} action={props.actions.checklist} />
        ) : props.sections ? (
          props.sections.map((home) => {
            const meta = SECTION_TITLES[home.section];
            const address = { checklistId: checklist.id, section: home.section };
            return (
              <ChecklistTable
                key={home.section}
                id={home.section}
                title={meta.title}
                note={meta.note}
                summary={rollup.sections[home.section]}
                rows={home.rows}
                task={task}
                version={version}
                checklistId={checklist.id}
                section={home.section}
                addParentId={null}
                canEdit={canEdit}
                open={open}
                canTime={props.canTime}
                time={props.time}
                actions={tableActions}
                selectedItem={props.selectedItem}
                {...shared}
                moveTargets={moveTargets(home.rows, null)}
                emptyText={`No ${meta.title.toLowerCase()} rows yet. An empty section counts as N/A.`}
                footer={<Paging taskTag={task.taskTag} address={address} cursor={home.cursor} nextCursor={home.nextCursor} />}
              />
            );
          })
        ) : props.page ? (
          <ChecklistTable
            id="rows"
            title={`Rows under ${current?.title ?? 'this row'}`}
            note={`${SECTION_TITLES[props.page.section].title} section`}
            rows={props.page.rows}
            task={task}
            version={version}
            checklistId={checklist.id}
            section={props.page.section}
            addParentId={props.page.nodeId}
            canEdit={canEdit}
            open={open}
            canTime={props.canTime}
            time={props.time}
            actions={tableActions}
            selectedItem={props.selectedItem}
            {...shared}
            moveTargets={moveTargets(props.page.rows, trail.length
              ? { id: trail[trail.length - 1].nodeId, title: `Up one level (under ${trail[trail.length - 1].title})` }
              : { id: null, title: `Up one level (top of ${SECTION_TITLES[props.page.section].title})` })}
            emptyText="No rows under this one yet. Once you add one, its progress comes from the rows under it."
            footer={<Paging taskTag={task.taskTag} address={{ checklistId: checklist.id, parentNodeId: props.page.nodeId, section: props.page.section }} cursor={props.page.cursor} nextCursor={props.page.nextCursor} />}
          />
        ) : null}
      </MissionPage>
    </ChecklistVersionProvider>
  );
}

function HomeHero({ task, ownerNames, checklist, rollup, version, actions, tools }: ChecklistWorkspaceProps & { checklist: NonNullable<ChecklistWorkspaceProps['checklist']>; tools?: ChecklistWorkspaceProps['managerTools'] }) {
  const activity = rollup.taskProgress;
  return (
    <section aria-label="Checklist summary" className="hero-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 basis-72">
          <p className="text-primary-subtle-foreground inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-xs font-semibold">
            <ClipboardCheckIcon className="size-3.5" aria-hidden="true" />
            Master checklist
          </p>
          <h1 className="text-foreground mt-3 text-[1.625rem] leading-tight font-bold tracking-tight break-words lg:text-[2rem]">{checklist.title}</h1>
          <p className="text-muted-foreground mt-1 text-sm break-words">{task.title}</p>
          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Task owner</span>
            <AvatarStack names={ownerNames} />
          </div>
        </div>
        <div className="grid w-full min-w-0 gap-2 rounded-2xl bg-card/85 p-4 shadow-(--shadow-card) sm:w-72">
          <div className="flex items-center gap-3">
            <span className="bg-recognition-subtle text-recognition-foreground flex size-10 shrink-0 items-center justify-center rounded-xl">
              <GaugeIcon className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="stat-figure">{percentText(activity) ?? 'Not started'}</p>
              <p className="text-muted-foreground text-xs">Activity progress</p>
            </div>
          </div>
          <MissionProgress value={activity} label="Activity progress" className="h-1.5" />
          <p className="text-muted-foreground text-xs">
            {rollup.isComplete ? 'Every row is complete or N/A. Reviewers approve before Done.' : 'Done waits until every row is complete or N/A.'}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {CHECKLIST_SECTIONS.map((key) => {
          const section = rollup.sections[key];
          const value = section.state === 'not_applicable' ? 'N/A' : percentText(section.progressPercentage) ?? 'Not started';
          return (
            <a key={key} href={`#${key}`} className="text-foreground hover:bg-card inline-flex items-center gap-1.5 rounded-full bg-card/70 px-3 py-1.5 text-xs font-semibold transition-colors">
              <SectionStateIcon section={section} className="size-3.5" />
              {SECTION_TITLES[key].title}
              <span className="text-muted-foreground tabular-nums">{value}</span>
            </a>
          );
        })}
        {tools ? (
          <div className="ml-auto">
            <ProgressSource task={task} checklistId={checklist.id} rollup={rollup} enabled={tools.activityDrivesProgress} version={version} action={actions.checklist} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PageHero({ rollup, page, title, parentTitle }: { rollup: ChecklistRollup; page: ChecklistPageView; title: string; parentTitle: string }) {
  const progress = rollup.nodeProgress.find(p => p.id === page.nodeId);
  const result = pageResult(progress);
  const value = progress?.applicable === false ? null : progress?.progressPercentage ?? null;
  const done = page.rows.filter(row => row.isComplete).length;
  return (
    <section aria-label="Checklist page summary" className="hero-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 basis-72">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-primary-subtle-foreground inline-flex items-center gap-1.5 rounded-full bg-card px-2.5 py-1 text-xs font-semibold">
              <FileStackIcon className="size-3.5" aria-hidden="true" />Checklist row
            </p>
            <span className="badge-soft badge-neutral">{SECTION_TITLES[page.section].title}</span>
          </div>
          <h1 className="text-foreground mt-3 text-[1.625rem] leading-tight font-bold tracking-tight break-words lg:text-[2rem]">{title}</h1>
          <p className="text-muted-foreground mt-1 text-sm break-words">Inside {parentTitle}</p>
        </div>
        <div className="grid w-full min-w-0 gap-2 rounded-2xl bg-card/85 p-4 shadow-(--shadow-card) sm:w-72">
          <div className="flex items-center justify-between gap-3">
            <p className="stat-figure">{result === 'N/A' ? 'N/A' : percentText(value) ?? (page.rows.length ? '—' : 'No rows')}</p>
            <span className={cn('badge-soft', result === 'CLOSED' ? 'badge-status-done' : result === 'N/A' ? 'badge-neutral' : 'badge-accent')}>
              {result}
            </span>
          </div>
          <MissionProgress value={value} label={`${title} progress`} className="h-1.5" />
          <p className="text-muted-foreground text-xs">{done} of {page.rows.length} row{page.rows.length === 1 ? '' : 's'} complete</p>
        </div>
      </div>
    </section>
  );
}

function Paging({ taskTag, address, cursor, nextCursor }: {
  taskTag: string;
  address: { checklistId: string; parentNodeId?: string; section: ChecklistSection };
  cursor: number;
  nextCursor: number | null;
}) {
  if (!cursor && nextCursor === null) return null;
  return (
    <nav aria-label="More rows" className="border-border flex flex-wrap gap-2 border-t px-4 py-3 sm:px-5">
      {cursor > 0 ? (
        <Button asChild variant="outline" size="sm">
          <Link href={`${checklistWorkHref(taskTag, { ...address, cursor: Math.max(0, cursor - PAGE_SIZE) })}#${address.parentNodeId ? 'rows' : address.section}`}>Previous rows</Link>
        </Button>
      ) : null}
      {nextCursor !== null ? (
        <Button asChild variant="outline" size="sm">
          <Link href={`${checklistWorkHref(taskTag, { ...address, cursor: nextCursor })}#${address.parentNodeId ? 'rows' : address.section}`}>Next rows</Link>
        </Button>
      ) : null}
    </nav>
  );
}

/** Manager: whether Activity drives mission progress (the sheet's Home E6), with a preview. */
function ProgressSource({ task, checklistId, rollup, enabled, version, action }: { task: Task; checklistId: string; rollup: ChecklistRollup; enabled: boolean; version: number; action: Command }) {
  return (
    <ChecklistSheetButton
      label={enabled ? 'Progress: Activity' : 'Progress: manual'}
      title="Where mission progress comes from"
      description={`Activity is ${percentText(rollup.taskProgress) ?? 'not available yet'}. Switching changes current progress without changing earlier earnings.`}
    >
      <ExecutionForm action={action} scope={`mode:${checklistId}`}>
        <input type="hidden" name="command" value="mode" />
        <input type="hidden" name="checklist_id" value={checklistId} />
        <input type="hidden" name="taskId" value={task.id} />
        <ChecklistVersionField fallback={version} />
        <input type="hidden" name="preview_progress" value={rollup.taskProgressDecimal ?? rollup.taskProgress ?? ''} />
        <fieldset className="grid gap-2">
          <legend className="text-foreground mb-1 text-sm font-medium">Mission progress comes from</legend>
          <label className="border-border has-checked:border-primary has-checked:bg-primary-subtle/50 flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2.5 text-sm">
            <input type="radio" name="enabled" value="true" defaultChecked={enabled} className="accent-primary mt-0.5" />
            <span><span className="font-semibold">The Activity rows.</span> <span className="text-muted-foreground">Progress follows the checklist.</span></span>
          </label>
          <label className="border-border has-checked:border-primary has-checked:bg-primary-subtle/50 flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2.5 text-sm">
            <input type="radio" name="enabled" value="false" defaultChecked={!enabled} className="accent-primary mt-0.5" />
            <span><span className="font-semibold">Manual updates.</span> <span className="text-muted-foreground">The current progress is kept.</span></span>
          </label>
        </fieldset>
        <Field id="progress-source-reason" label="Why?" hint="Kept with the checklist history." required>
          <Input id="progress-source-reason" name="reason" required maxLength={1000} />
        </Field>
        <Button type="submit" className="justify-self-start">Save</Button>
      </ExecutionForm>
    </ChecklistSheetButton>
  );
}

/** Manager: top-level rows from older checklists that have no section yet. */
function NeedsMapping({ task, checklistId, rows, version, action }: { task: Task; checklistId: string; rows: readonly { id: string; title: string }[]; version: number; action: Command }) {
  return (
    <section aria-labelledby="needs-mapping-heading" className="soft-card grid gap-3 p-4 sm:p-5">
      <div>
        <h2 id="needs-mapping-heading" className="text-foreground text-base font-bold tracking-tight">Rows without a section</h2>
        <p className="text-muted-foreground text-sm">These rows came from an older checklist. Choose Setup, Activity or Closure for each; the rows under it follow.</p>
      </div>
      <ul className="grid gap-3">
        {rows.map(row => (
          <li key={row.id}>
            <ExecutionForm action={action} scope={`map:${row.id}`}>
              <input type="hidden" name="command" value="map" />
              <input type="hidden" name="checklist_id" value={checklistId} />
              <input type="hidden" name="taskId" value={task.id} />
              <input type="hidden" name="node_id" value={row.id} />
              <ChecklistVersionField fallback={version} />
              <div className="flex flex-wrap items-end gap-2">
                <p className="text-foreground min-w-40 flex-1 basis-48 font-medium break-words">{row.title}</p>
                <label className="grid gap-1 text-xs font-medium">
                  Section
                  <select name="section" required defaultValue="activity" className="border-input bg-card text-foreground focus-visible:ring-ring h-9 rounded-lg border px-2 text-sm outline-none focus-visible:ring-2">
                    {CHECKLIST_SECTIONS.map(key => <option key={key} value={key}>{SECTION_TITLES[key].title}</option>)}
                  </select>
                </label>
                <label className="grid min-w-40 flex-1 gap-1 text-xs font-medium">
                  Why?
                  <Input name="reason" required maxLength={1000} className="h-9" />
                </label>
                <Button type="submit" size="sm" className="h-9">Set section</Button>
              </div>
            </ExecutionForm>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NoChecklist({ task, version, canCreate, action }: { task: Task; version: number; canCreate: boolean; action: Command }) {
  return (
    <section className="soft-card grid gap-3 p-5 sm:p-6">
      <h1 className="text-foreground text-xl font-bold tracking-tight">This mission has no checklist yet</h1>
      <p className="text-muted-foreground text-sm">A master checklist holds the Setup, Activity and Closure rows for {task.title}.</p>
      {canCreate ? (
        <ExecutionForm action={action} scope={`create:${task.id}`}>
          <input type="hidden" name="command" value="create" />
          <input type="hidden" name="taskId" value={task.id} />
          <ChecklistVersionField fallback={version} />
          <div className="flex flex-wrap items-end gap-2">
            <Field id="checklist-title" label="Checklist title" className="min-w-60 flex-1">
              <Input id="checklist-title" name="title" defaultValue="Master checklist" required />
            </Field>
            <Button type="submit">Create checklist</Button>
          </div>
        </ExecutionForm>
      ) : (
        <p className="text-muted-foreground text-sm">An assignee or a manager can create it.</p>
      )}
    </section>
  );
}
