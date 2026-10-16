import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  CircleDotIcon,
  ClipboardCheckIcon,
  FlagIcon,
  GaugeIcon,
  InfoIcon,
  ListChecksIcon,
  PlusIcon,
  TriangleAlertIcon,
  ZapIcon,
  type LucideIcon,
} from 'lucide-react';

import {
  AddNodeForm,
  ChecklistRow,
  CommandFields,
  EmptyRows,
  FIELD,
  LABEL,
  LABEL_TEXT,
  ReasonInput,
  percentage,
  type ChecklistContext,
} from '@/components/checklists/checklist-rows';
import { MissionPanel, MissionProgress } from '@/components/missions/mission-ui';
import { ExecutionForm } from '@/components/tasks/execution-form';
import { Button } from '@/components/ui/button';
import { requireProfile } from '@/lib/auth/profile';
import { CHECKLIST_SECTIONS, type ChecklistSection, type SectionProgress } from '@/lib/checklists/progress';
import { normalizeTaskTagParam, resolveTaskDetailRouteState } from '@/lib/tasks/detail';
import { getTaskWorkspaceData } from '@/lib/tasks/queries';
import { canManageTasks, canUpdateTaskOwnFields } from '@/lib/tasks/permissions';
import { cn } from '@/lib/utils';
import type { ChecklistNode } from '@/types/tracker';

import { checklistCommand } from './actions';

export async function generateMetadata({ params }: { params: Promise<{ taskTag: string }> }): Promise<Metadata> {
  const tag = normalizeTaskTagParam((await params).taskTag);
  return { title: `${tag ?? 'Mission'} checklist · TaskPulse` };
}

const SECTION_META: Record<ChecklistSection, { label: string; heading: string; icon: LucideIcon; note: string }> = {
  setup: { label: 'Setup', heading: 'Setup & pre-requisites', icon: ClipboardCheckIcon, note: 'Completion gate' },
  activity: { label: 'Activity', heading: 'Activity', icon: ZapIcon, note: 'Drives activity-derived progress' },
  closure: { label: 'Closure', heading: 'Closure & handoff', icon: FlagIcon, note: 'Completion gate' },
};

function SectionStateIcon({ section, className }: { section: SectionProgress; className?: string }) {
  if (section.state === 'complete' || section.state === 'not_applicable') {
    return <CheckCircle2Icon className={cn('text-success-strong', className)} aria-hidden="true" />;
  }
  if (section.state === 'invalid') return <TriangleAlertIcon className={cn('text-rose-700', className)} aria-hidden="true" />;
  if (section.state === 'partial') return <CircleDotIcon className={cn('text-recognition-foreground', className)} aria-hidden="true" />;
  return <CircleDashedIcon className={cn('text-muted-foreground', className)} aria-hidden="true" />;
}

/**
 * Master checklist home (layout references: Stitch master_checklist_1/2 and the
 * sheet tracker's Checklist Home/Index). Each section lists its top-level rows;
 * pages open their own checklist page at /tasks/[tag]/checklist/[nodeId]. Every
 * figure is the existing checklist rollup; no XP, credits or other new rules.
 */
export default async function ChecklistPage({ params }: { params: Promise<{ taskTag: string }> }) {
  const user = await requireProfile();
  const route = await resolveTaskDetailRouteState((await params).taskTag);
  if (route.status !== 'ready') notFound();

  const d = route.data;
  const r = d.checklistRollup!;
  const manager = canManageTasks(user.role);
  const executor = canUpdateTaskOwnFields(user, d.task);
  const open = !d.task.archivedEffectiveDate && !['Done', 'Discarded'].includes(d.task.status);
  const choices = manager ? (await getTaskWorkspaceData()).tasks.filter(t => t.id !== d.task.id) : [];
  const missionHref = `/tasks/${encodeURIComponent(d.task.taskTag)}`;
  const ctx: ChecklistContext = {
    action: checklistCommand,
    task: d.task,
    nodes: d.checklistNodes,
    rollup: r,
    linkedTasksById: d.linkedTasksById,
    choices,
    manager,
    executor,
    open,
  };
  const groups = rootsBySection(d.checklistNodes);
  const ownerLabel = d.checklist?.syncProgressToTask ? 'Activity checklist' : 'Manual';
  const sideColumn = executor && open;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pt-5 pb-10 lg:px-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
        <Link
          href={missionHref}
          aria-label="Back to mission"
          className="text-muted-foreground hover:text-foreground hover:bg-muted flex size-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-(--shadow-card) transition-colors"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
        </Link>
        <Link href="/tasks" className="text-muted-foreground hover:text-foreground hidden shrink-0 font-medium sm:inline">
          Missions
        </Link>
        <span aria-hidden="true" className="text-muted-foreground hidden sm:inline">/</span>
        <Link href={missionHref} className="task-tag bg-primary-subtle text-primary-subtle-foreground shrink-0 rounded-md px-2 py-0.5">
          {d.task.taskTag}
        </Link>
        <span aria-hidden="true" className="text-muted-foreground">/</span>
        <span className="text-foreground truncate font-medium" aria-current="page">Master checklist</span>
      </nav>

      {/* Hero */}
      <section
        aria-label="Master checklist summary"
        className="border-primary/15 mt-5 overflow-hidden rounded-2xl border bg-linear-135 from-[#ece9ff] via-[#f3f0ff] to-[#fff4e2] p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
          <div className="min-w-0 flex-1 basis-72">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-primary-subtle-foreground inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold tracking-[0.06em] uppercase">
                <ClipboardCheckIcon className="size-3.5" aria-hidden="true" />
                Mission master checklist
              </span>
              <span className="task-tag rounded-md bg-white px-2 py-0.5">{d.task.taskTag}</span>
            </div>
            <h1 className="text-foreground mt-3 text-[1.625rem] leading-tight font-bold tracking-tight break-words lg:text-[2rem]">
              {d.checklist?.title ?? 'Master checklist'}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm break-words">{d.task.title}</p>
          </div>
          <div className="grid w-full min-w-0 gap-2 rounded-2xl bg-white/85 p-4 shadow-(--shadow-card) sm:w-72">
            <div className="flex items-center gap-3">
              <span className="bg-recognition-subtle text-recognition-foreground flex size-10 shrink-0 items-center justify-center rounded-xl">
                <GaugeIcon className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="stat-figure">{percentage(r.taskProgress)}</p>
                <p className="text-muted-foreground text-xs">Activity rollup</p>
              </div>
            </div>
            <MissionProgress value={r.taskProgress} label="Activity rollup" className="h-1.5" />
          </div>
        </div>
        <div className="mt-4 grid gap-1 rounded-xl bg-white/70 px-4 py-3 text-sm">
          <h2 className="text-foreground font-semibold">Progress owner: {ownerLabel}</h2>
          <p className="text-foreground">Activity: {percentage(r.taskProgress)}. Current task progress: {percentage(d.task.progressPercentage)}.</p>
          <p className="text-muted-foreground flex items-start gap-2 text-xs">
            <InfoIcon className="text-primary mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>Each parent weights applicable direct children equally. Setup and Closure are completion gates. A linked task at 100% still needs its own Done approval.</span>
          </p>
        </div>
      </section>

      {/* Milestone breakdown */}
      <section aria-label="Milestone breakdown" className="mt-5 grid gap-3 md:grid-cols-3">
        {CHECKLIST_SECTIONS.map((s, index) => {
          const section = r.sections[s];
          const na = section.state === 'not_applicable';
          return (
            <div key={s} className="soft-card grid content-start gap-3 p-4">
              <div className="flex min-w-0 items-center gap-2">
                <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold', section.isComplete ? 'bg-emerald-100 text-emerald-800' : 'bg-primary-subtle text-primary-subtle-foreground')}>
                  {index + 1}
                </span>
                <h3 className="text-foreground min-w-0 flex-1 font-semibold capitalize">{s}</h3>
                <p className="badge-soft badge-neutral tabular-nums">{na ? 'Not applicable' : percentage(section.progressPercentage)}</p>
              </div>
              <MissionProgress value={na ? null : section.progressPercentage} label={`${SECTION_META[s].label} progress`} className="h-1.5" />
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <SectionStateIcon section={section} className="size-3.5 shrink-0" />
                <span>{section.state.replaceAll('_', ' ')} - {section.isComplete ? 'Gate satisfied' : 'Needs attention'}</span>
              </p>
              {manager && open && d.checklist ? (
                <ExecutionForm action={checklistCommand} scope={`section:${d.task.id}:${s}`} className="soft-divider grid gap-2 pt-3">
                  <CommandFields ctx={ctx} command="section" />
                  <input type="hidden" name="section" value={s} />
                  <label className={LABEL}>
                    <span className={LABEL_TEXT}>Section review</span>
                    <select name="intentional_empty" className={cn(FIELD, 'h-9')}>
                      <option value="false">Confirm initialized work</option>
                      <option value="true">Confirm intentionally empty</option>
                    </select>
                  </label>
                  <ReasonInput placeholder="Reason for section review" />
                  <Button type="submit" variant="accent" size="sm" className="justify-self-start rounded-xl">Confirm section</Button>
                </ExecutionForm>
              ) : null}
            </div>
          );
        })}
      </section>

      {r.errors.length ? (
        <div role="alert" className="mt-5 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 break-words">
            <p className="font-semibold">Correct these references or explicitly map legacy roots:</p>
            <ul className="mt-1 list-disc pl-5">{[...new Set(r.errors)].map(e => <li key={e}>{e}</li>)}</ul>
          </div>
        </div>
      ) : null}

      <div className={cn('mt-5 grid gap-5', sideColumn && 'xl:grid-cols-[minmax(0,1fr)_22rem]')}>
        <main className="grid min-w-0 content-start gap-5">
          <MissionPanel
            icon={ListChecksIcon}
            title="Checklist items"
            subtitle={`${d.checklistNodes.length} item${d.checklistNodes.length === 1 ? '' : 's'} across Setup, Activity and Closure. Open a page to see and add the items inside it.`}
          >
            <div className="grid gap-6">
              {groups.map(({ section, nodes }) => {
                const meta = section ? SECTION_META[section] : null;
                const Icon = meta?.icon ?? TriangleAlertIcon;
                const rollup = section ? r.sections[section] : null;
                return (
                  <div key={section ?? 'unsectioned'} className="grid gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-xl', meta ? 'bg-primary-subtle text-primary' : 'bg-attention-subtle text-attention-foreground')}>
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-foreground font-bold">{meta?.heading ?? 'Needs mapping'}</h3>
                        <p className="text-muted-foreground text-xs">{meta?.note ?? 'Unsectioned items need manager review'} · {nodes.length} top-level item{nodes.length === 1 ? '' : 's'}</p>
                      </div>
                      {rollup ? (
                        <span className={cn('badge-soft', rollup.isComplete ? 'badge-status-done' : 'badge-accent')}>
                          {rollup.state === 'not_applicable' ? 'N/A' : percentage(rollup.progressPercentage)}
                        </span>
                      ) : null}
                    </div>
                    <div className="grid gap-2">{nodes.map(n => <ChecklistRow key={n.id} ctx={ctx} node={n} />)}</div>
                  </div>
                );
              })}
              {!d.checklistNodes.length ? (
                <EmptyRows>No items yet. A manager can initialize work or explicitly confirm empty sections.</EmptyRows>
              ) : null}
            </div>
          </MissionPanel>

          <section aria-label="Completion gates" className="border-primary/15 bg-primary-subtle/50 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border p-4 sm:p-5">
            <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', r.isComplete ? 'bg-emerald-100 text-emerald-800' : 'text-primary bg-white')}>
              {r.isComplete ? <CheckCircle2Icon className="size-5" aria-hidden="true" /> : <FlagIcon className="size-5" aria-hidden="true" />}
            </span>
            <p className="text-foreground min-w-0 flex-1 basis-60 text-sm font-medium">
              {r.isComplete ? 'All checklist gates satisfied. Assigned reviewers must approve the current work before Done.' : 'Done is blocked until all sections are initialized and applicable work is complete.'}
            </p>
            <Button asChild className="rounded-xl max-sm:w-full">
              <Link href={missionHref}>
                Back to mission
                <ArrowRightIcon aria-hidden="true" />
              </Link>
            </Button>
          </section>
        </main>

        {sideColumn ? (
          <aside className="grid min-w-0 content-start gap-5">
            {!d.checklist ? (
              <MissionPanel icon={PlusIcon} title="Create checklist">
                <ExecutionForm action={checklistCommand} scope={`create:${d.task.id}`}>
                  <CommandFields ctx={ctx} command="create" />
                  <label className={LABEL}>
                    <span className={LABEL_TEXT}>Checklist title</span>
                    <input name="title" defaultValue="Master checklist" required className={cn(FIELD, 'h-10')} />
                  </label>
                  <Button type="submit" className="rounded-xl">Create manual checklist</Button>
                </ExecutionForm>
              </MissionPanel>
            ) : (
              <>
                <MissionPanel icon={PlusIcon} title="Add item" subtitle="Choose Page to make a row that opens its own checklist page.">
                  <AddNodeForm ctx={ctx} parent={null} />
                </MissionPanel>
                {manager ? (
                  <MissionPanel icon={GaugeIcon} title="Change progress owner">
                    <p className="text-muted-foreground mb-3 text-sm">Preview: Activity {percentage(r.taskProgress)}. Switching updates current progress without changing earlier earnings. Later changes use their effective scale and shares.</p>
                    <ExecutionForm action={checklistCommand} scope={`mode:${d.task.id}`}>
                      <CommandFields ctx={ctx} command="mode" />
                      <input type="hidden" name="preview_progress" value={r.taskProgressDecimal ?? r.taskProgress ?? ''} />
                      <label className={LABEL}>
                        <span className={LABEL_TEXT}>Owner</span>
                        <select name="enabled" defaultValue={String(d.checklist.syncProgressToTask)} className={cn(FIELD, 'h-10')}>
                          <option value="false">Manual - retain current progress</option>
                          <option value="true">Activity-derived</option>
                        </select>
                      </label>
                      <ReasonInput placeholder="Reason after reviewing all sections" />
                      <Button type="submit" className="rounded-xl">Apply reviewed switch</Button>
                    </ExecutionForm>
                  </MissionPanel>
                ) : null}
              </>
            )}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

const isSectionRoot = (n: ChecklistNode, section: ChecklistSection | null) =>
  section !== null && !n.parentNodeId && ['Group', 'Page'].includes(n.nodeType) && n.title.trim().toLowerCase() === section;

/**
 * Top-level rows per section (Setup, Activity, Closure, then unsectioned), in
 * stored order. A node whose parent is missing or in another section is shown
 * at the top of its own section so nothing becomes unreachable.
 */
function rootsBySection(nodes: readonly ChecklistNode[]) {
  const keys: (ChecklistSection | null)[] = [...CHECKLIST_SECTIONS, null];
  return keys
    .map(section => {
      const inGroup = nodes.filter(n => (n.section ?? null) === section);
      const ids = new Set(inGroup.map(n => n.id));
      const roots = inGroup.filter(n => !n.parentNodeId || !ids.has(n.parentNodeId));
      // Templates and native initialization add one root group per section
      // ("Setup", "Activity", "Closure"); that group is the section itself, so
      // its rows are listed directly instead of behind one more click.
      return {
        section,
        nodes: roots.flatMap(n => (isSectionRoot(n, section) ? inGroup.filter(c => c.parentNodeId === n.id) : [n])),
      };
    })
    .filter(group => group.nodes.length > 0);
}
