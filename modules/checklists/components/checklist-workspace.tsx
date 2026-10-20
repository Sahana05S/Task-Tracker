import Link from 'next/link';
import { ArrowLeftIcon, CheckCircle2Icon, CircleDashedIcon, CircleDotIcon, ClipboardCheckIcon, FileStackIcon, GaugeIcon, TriangleAlertIcon } from 'lucide-react';

import { Button } from '@/shared/ui/button';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { Field } from '@/shared/ui/form-field';
import { Input } from '@/shared/ui/input';
import { AvatarStack, MissionProgress } from '@/shared/ui/mission-ui';
import { cn } from '@/shared/utils';
import { checklistHref } from '../internal/pages';
import { checklistWorkHref } from '../internal/location';
import { CHECKLIST_SECTIONS, type ChecklistRollup, type ChecklistSection, type SectionProgress } from '../internal/progress';
import type { ChecklistAncestor, ChecklistBranchRow } from '../internal/branch-types';
import type { ChecklistItemTime } from '../internal/item-time';
import { SECTION_TITLES, checklistIssues, pageResult, percentText } from '../internal/table';
import { ChecklistSheetButton } from './checklist-sheet-button';
import { ChecklistVersionField, ChecklistVersionProvider } from './checklist-state-control';
import { ChecklistIssues, ChecklistTable } from './checklist-table';
import type { ActionResponse, Task } from '@/types/tracker';

type Command = (form: FormData) => Promise<ActionResponse<unknown>>;

export interface ChecklistHomeSection {
  section: ChecklistSection;
  rows: ChecklistBranchRow[];
  /** The section's own root page when templates created one; new rows go inside it. */
  addParentId: string | null;
  cursor: number;
  nextCursor: number | null;
  /** Set when a section-root page has more rows than the home shows. */
  moreHref: string | null;
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
  checklist: { id: string; ownerNodeId: string | null; title: string } | null;
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
  actions: { checklist: Command; start: Command; stop: Command; discard: Command };
}

const PAGE_SIZE = 50;

function SectionIcon({ section, className }: { section: SectionProgress; className?: string }) {
  if (section.state === 'complete' || (section.state === 'not_applicable' && section.isComplete)) return <CheckCircle2Icon className={cn('text-success-strong', className)} aria-hidden="true" />;
  if (section.state === 'invalid') return <TriangleAlertIcon className={cn('text-rose-700', className)} aria-hidden="true" />;
  if (section.state === 'partial') return <CircleDotIcon className={cn('text-primary', className)} aria-hidden="true" />;
  return <CircleDashedIcon className={cn('text-muted-foreground', className)} aria-hidden="true" />;
}

function ancestorHref(taskTag: string, ancestor: ChecklistAncestor, section: ChecklistSection) {
  return checklistWorkHref(taskTag, ancestor.ownedChecklistId
    ? { checklistId: ancestor.ownedChecklistId, section: 'activity' }
    : { checklistId: ancestor.checklistId, parentNodeId: ancestor.nodeId, section });
}

/**
 * The master checklist (the sheet's Checklist Home and "[ChL]" tabs). The
 * home shows Setup, Activity and Closure as three tables; a Page opens its own
 * table with a breadcrumb back. Every figure is the authoritative branch
 * rollup; Activity drives progress and Setup / Closure are completion gates.
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
  // A page goes back to the page or checklist that holds it; a Sub-mission
  // checklist (whose last ancestor is its own row) to the checklist above it.
  const backHref = props.page
    ? (trail.length ? ancestorHref(task.taskTag, trail[trail.length - 1], section) : homeHref)
    : ancestors.length > 1 ? ancestorHref(task.taskTag, ancestors[ancestors.length - 2], 'activity')
      : ancestors.length === 1 ? homeHref : missionHref;
  const structureHref = manager && !checklist?.ownerNodeId ? checklistHref(task.taskTag) : undefined;
  const tableActions = { checklist: props.actions.checklist, start: props.actions.start, stop: props.actions.stop, discard: props.actions.discard };
  const issues = checklistIssues(rollup.errors);

  return (
    <ChecklistVersionProvider version={version}>
      <div className="mx-auto grid w-full max-w-[1200px] content-start gap-5 px-4 pt-6 pb-10 lg:px-6">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
          <Link
            href={backHref}
            aria-label="Back"
            className="text-muted-foreground hover:text-foreground hover:bg-muted bg-card flex size-9 shrink-0 items-center justify-center rounded-xl shadow-(--shadow-card) transition-colors"
          >
            <ArrowLeftIcon className="size-4" aria-hidden="true" />
          </Link>
          <ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <li>
              <Link href={missionHref} className="task-tag bg-primary-subtle text-primary-subtle-foreground rounded-md px-2 py-0.5">{task.taskTag}</Link>
            </li>
            <li className="flex items-center gap-2">
              <span aria-hidden="true" className="text-muted-foreground">/</span>
              {props.sections && !ancestors.length ? (
                <span className="text-foreground font-medium" aria-current="page">Master checklist</span>
              ) : (
                <Link href={homeHref} className="text-muted-foreground hover:text-foreground font-medium">Master checklist</Link>
              )}
            </li>
            {ancestors.map((ancestor, index) => {
              const isCurrent = index === ancestors.length - 1 && (props.page || props.sections);
              return (
                <li key={ancestor.nodeId} className={cn('flex min-w-0 items-center gap-2', index < ancestors.length - 2 && 'max-sm:hidden')}>
                  <span aria-hidden="true" className="text-muted-foreground">/</span>
                  {isCurrent ? (
                    <span className="text-foreground max-w-[16rem] truncate font-medium" aria-current="page">{ancestor.title}</span>
                  ) : (
                    <Link href={ancestorHref(task.taskTag, ancestor, section)} className="text-muted-foreground hover:text-foreground max-w-[12rem] truncate font-medium">{ancestor.title}</Link>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        {checklist && props.sections ? (
          <HomeHero {...props} checklist={checklist} structureHref={structureHref} />
        ) : checklist && props.page ? (
          <PageHero rollup={rollup} page={props.page} title={current?.title ?? 'Checklist page'} parentTitle={trail.at(-1)?.title ?? checklist.title} />
        ) : null}

        <ChecklistIssues issues={issues} />

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
                addParentId={home.addParentId}
                canEdit={canEdit}
                open={open}
                canTime={props.canTime}
                time={props.time}
                actions={tableActions}
                selectedItem={props.selectedItem}
                structureHref={structureHref}
                emptyText={`No ${meta.title.toLowerCase()} rows yet.`}
                headerAction={manager && open ? (
                  <SectionReview task={task} checklistId={checklist.id} section={home.section} version={version} action={props.actions.checklist} />
                ) : null}
                footer={<Paging taskTag={task.taskTag} address={address} cursor={home.cursor} nextCursor={home.nextCursor} moreHref={home.moreHref} />}
              />
            );
          })
        ) : props.page ? (
          <ChecklistTable
            id="rows"
            title="Rows on this page"
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
            structureHref={structureHref}
            emptyText="This page has no rows yet."
            footer={<Paging taskTag={task.taskTag} address={{ checklistId: checklist.id, parentNodeId: props.page.nodeId, section: props.page.section }} cursor={props.page.cursor} nextCursor={props.page.nextCursor} moreHref={null} />}
          />
        ) : null}

        {checklist?.ownerNodeId ? (
          <p className="text-muted-foreground text-sm">Sub-mission owners and deadline follow the mission. Time logged here counts on the mission.</p>
        ) : null}
      </div>
    </ChecklistVersionProvider>
  );
}

function HomeHero({ task, ownerNames, checklist, rollup, structureHref }: ChecklistWorkspaceProps & { checklist: NonNullable<ChecklistWorkspaceProps['checklist']>; structureHref?: string }) {
  const activity = rollup.taskProgress;
  return (
    <section aria-label="Checklist summary" className="hero-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 basis-72">
          <p className="text-primary-subtle-foreground inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold">
            <ClipboardCheckIcon className="size-3.5" aria-hidden="true" />
            {checklist.ownerNodeId ? 'Sub-mission checklist' : 'Master checklist'}
          </p>
          <h1 className="text-foreground mt-3 text-[1.625rem] leading-tight font-bold tracking-tight break-words lg:text-[2rem]">{checklist.title}</h1>
          <p className="text-muted-foreground mt-1 text-sm break-words">{task.title}</p>
          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Task owner</span>
            <AvatarStack names={ownerNames} />
          </div>
        </div>
        <div className="grid w-full min-w-0 gap-2 rounded-2xl bg-white/85 p-4 shadow-(--shadow-card) sm:w-72">
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
            {rollup.isComplete ? 'All three sections are complete. Reviewers approve before Done.' : 'Done waits until Setup, Activity and Closure are complete.'}
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {CHECKLIST_SECTIONS.map((key) => {
          const section = rollup.sections[key];
          const value = section.state === 'not_applicable' ? 'N/A' : percentText(section.progressPercentage) ?? 'Not started';
          return (
            <a key={key} href={`#${key}`} className="text-foreground hover:bg-white inline-flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 text-xs font-semibold transition-colors">
              <SectionIcon section={section} className="size-3.5" />
              {SECTION_TITLES[key].title}
              <span className="text-muted-foreground tabular-nums">{value}</span>
            </a>
          );
        })}
        {structureHref ? (
          <Button asChild variant="outline" size="sm" className="ml-auto rounded-xl bg-white/80">
            <Link href={structureHref}>Structure and linked missions</Link>
          </Button>
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
            <p className="text-primary-subtle-foreground inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold">
              <FileStackIcon className="size-3.5" aria-hidden="true" />Checklist page
            </p>
            <span className="badge-soft badge-neutral">{SECTION_TITLES[page.section].title}</span>
          </div>
          <h1 className="text-foreground mt-3 text-[1.625rem] leading-tight font-bold tracking-tight break-words lg:text-[2rem]">{title}</h1>
          <p className="text-muted-foreground mt-1 text-sm break-words">Inside {parentTitle}</p>
        </div>
        <div className="grid w-full min-w-0 gap-2 rounded-2xl bg-white/85 p-4 shadow-(--shadow-card) sm:w-72">
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

function Paging({ taskTag, address, cursor, nextCursor, moreHref }: {
  taskTag: string;
  address: { checklistId: string; parentNodeId?: string; section: ChecklistSection };
  cursor: number;
  nextCursor: number | null;
  moreHref: string | null;
}) {
  if (!cursor && nextCursor === null && !moreHref) return null;
  return (
    <nav aria-label="More rows" className="border-border flex flex-wrap gap-2 border-t px-4 py-3 sm:px-5">
      {cursor > 0 ? (
        <Button asChild variant="outline" size="sm" className="rounded-xl">
          <Link href={`${checklistWorkHref(taskTag, { ...address, cursor: Math.max(0, cursor - PAGE_SIZE) })}#${address.parentNodeId ? 'rows' : address.section}`}>Previous rows</Link>
        </Button>
      ) : null}
      {nextCursor !== null ? (
        <Button asChild variant="outline" size="sm" className="rounded-xl">
          <Link href={`${checklistWorkHref(taskTag, { ...address, cursor: nextCursor })}#${address.parentNodeId ? 'rows' : address.section}`}>Next rows</Link>
        </Button>
      ) : null}
      {moreHref ? (
        <Button asChild variant="outline" size="sm" className="rounded-xl">
          <Link href={moreHref}>Show every row</Link>
        </Button>
      ) : null}
    </nav>
  );
}

function SectionReview({ task, checklistId, section, version, action }: { task: Task; checklistId: string; section: ChecklistSection; version: number; action: Command }) {
  const title = SECTION_TITLES[section].title;
  return (
    <ChecklistSheetButton
      label="Review"
      title={`Review ${title}`}
      description={`Confirm the ${title} section so it can count towards Done.`}
    >
      <ExecutionForm action={action} scope={`section:${checklistId}:${section}`}>
        <input type="hidden" name="command" value="section" />
        <input type="hidden" name="checklist_id" value={checklistId} />
        <input type="hidden" name="taskId" value={task.id} />
        <ChecklistVersionField fallback={version} />
        <input type="hidden" name="section" value={section} />
        <fieldset className="grid gap-2">
          <legend className="text-foreground mb-1 text-sm font-medium">What is true for this section?</legend>
          <label className="border-border has-checked:border-primary has-checked:bg-primary-subtle/50 flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2.5 text-sm">
            <input type="radio" name="intentional_empty" value="false" defaultChecked className="accent-primary mt-0.5" />
            <span><span className="font-semibold">The work is set up.</span> <span className="text-muted-foreground">Its rows are the work to complete.</span></span>
          </label>
          <label className="border-border has-checked:border-primary has-checked:bg-primary-subtle/50 flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2.5 text-sm">
            <input type="radio" name="intentional_empty" value="true" className="accent-primary mt-0.5" />
            <span><span className="font-semibold">Nothing is needed here.</span> <span className="text-muted-foreground">Only allowed when the section has no rows to complete.</span></span>
          </label>
        </fieldset>
        <Field id={`review-${section}-reason`} label="Why?" hint="Kept with the checklist history." required>
          <Input id={`review-${section}-reason`} name="reason" required maxLength={1000} />
        </Field>
        <Button type="submit" className="justify-self-start rounded-xl">Confirm {title}</Button>
      </ExecutionForm>
    </ChecklistSheetButton>
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
            <Button type="submit" className="rounded-xl">Create checklist</Button>
          </div>
        </ExecutionForm>
      ) : (
        <p className="text-muted-foreground text-sm">An assignee or a manager can create it.</p>
      )}
    </section>
  );
}
