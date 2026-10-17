import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeftIcon,
  ClockIcon,
  ExternalLinkIcon,
  FileStackIcon,
  HourglassIcon,
  ListChecksIcon,
  PencilIcon,
  PlusIcon,
  SquareCheckIcon,
  TimerIcon,
} from 'lucide-react';

import {
  AddNodeForm,
  ChecklistRow,
  CompletionForm,
  EditNodeForms,
  EmptyRows,
  ItemTimerControls,
  loggedTime,
  ancestry,
  checklistHref,
  childrenOf,
  formatMinutes,
  isContainer,
  percentage,
  type ChecklistContext,
} from '@/components/checklists/checklist-rows';
import { MissionPanel, MissionProgress } from '@/components/missions/mission-ui';
import { requireProfile } from '@/shared/session/profile';
import { getChecklistItemTime } from '@/lib/checklists/item-time';
import { normalizeTaskTagParam, resolveTaskDetailRouteState } from '@/modules/tasks';
import { getTaskWorkspaceData } from '@/modules/tasks';
import { canManageTasks, canUpdateTaskOwnFields } from '@/modules/tasks';
import { canStartTimerForTask } from '@/lib/timers/permissions';
import { cn } from '@/shared/utils';

import { discardTaskTimer, startItemTimer, stopTaskTimer } from '../../timer-actions';
import { checklistCommand } from '../actions';

type Params = Promise<{ taskTag: string; nodeId: string }>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const tag = normalizeTaskTagParam((await params).taskTag);
  return { title: `${tag ?? 'Mission'} checklist page · TaskPulse` };
}

/**
 * One checklist page (the sheet tracker's "[ChL]" tab): its result, progress,
 * back link and breadcrumb, then its direct rows. Any row can open its own
 * page, so pages nest as deep as the checklist goes.
 */
export default async function ChecklistNodePage({ params }: { params: Params }) {
  const { taskTag, nodeId } = await params;
  if (!UUID.test(nodeId)) notFound();
  const user = await requireProfile();
  const route = await resolveTaskDetailRouteState(taskTag);
  if (route.status !== 'ready') notFound();

  const d = route.data;
  const node = d.checklistNodes.find(n => n.id === nodeId);
  if (!node || !d.checklistRollup) notFound();

  const r = d.checklistRollup;
  const manager = canManageTasks(user.role);
  const executor = canUpdateTaskOwnFields(user, d.task);
  const open = !d.task.archivedEffectiveDate && !['Done', 'Discarded'].includes(d.task.status);
  const [choices, timeInfo] = await Promise.all([
    manager ? getTaskWorkspaceData().then(w => w.tasks.filter(t => t.id !== d.task.id)) : Promise.resolve([]),
    getChecklistItemTime(d.task.id, user.id),
  ]);
  const canStart = canStartTimerForTask(user, d.task);
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
    time: { info: timeInfo, canStart, start: startItemTimer, stop: stopTaskTimer, discard: discardTaskTimer },
  };

  const chain = ancestry(node.id, d.checklistNodes);
  const parent = chain.length > 1 ? chain[chain.length - 2] : null;
  const homeHref = checklistHref(d.task.taskTag);
  const backHref = parent ? checklistHref(d.task.taskTag, parent.id) : homeHref;
  const rows = childrenOf(node.id, d.checklistNodes);
  const container = isContainer(node, d.checklistNodes);
  const progress = r.nodeProgress.find(p => p.id === node.id);
  const notApplicable = progress?.applicable === false;
  const result = notApplicable ? 'N/A' : progress?.isComplete ? 'CLOSED' : 'OPEN';
  const estimate = formatMinutes(node.estimatedMinutes);
  const elapsed = loggedTime(ctx, node.id);
  const done = rows.filter(n => r.nodeProgress.find(p => p.id === n.id)?.isComplete).length;
  const canEdit = executor && open;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 pt-5 pb-10 lg:px-6">
      {/* Breadcrumb: Missions / TAG / Master checklist / ancestors / this page */}
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
        <Link
          href={backHref}
          aria-label={parent ? `Back to ${parent.title}` : 'Back to master checklist'}
          className="text-muted-foreground hover:text-foreground hover:bg-muted flex size-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-(--shadow-card) transition-colors"
        >
          <ArrowLeftIcon className="size-4" aria-hidden="true" />
        </Link>
        <ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <li className="hidden sm:block">
            <Link href={`/tasks/${encodeURIComponent(d.task.taskTag)}`} className="task-tag bg-primary-subtle text-primary-subtle-foreground rounded-md px-2 py-0.5">
              {d.task.taskTag}
            </Link>
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="text-muted-foreground hidden sm:inline">/</span>
            <Link href={homeHref} className="text-muted-foreground hover:text-foreground font-medium">Master checklist</Link>
          </li>
          {chain.map((n, i) => (
            <li key={n.id} className={cn('flex min-w-0 items-center gap-2', i < chain.length - 2 && 'max-sm:hidden')}>
              <span aria-hidden="true" className="text-muted-foreground">/</span>
              {n.id === node.id ? (
                <span className="text-foreground max-w-[16rem] truncate font-medium" aria-current="page">{n.title}</span>
              ) : (
                <Link href={checklistHref(d.task.taskTag, n.id)} className="text-muted-foreground hover:text-foreground max-w-[12rem] truncate font-medium">{n.title}</Link>
              )}
            </li>
          ))}
        </ol>
      </nav>

      {/* Hero */}
      <section
        aria-label="Checklist page summary"
        className="border-primary/15 mt-5 overflow-hidden rounded-2xl border bg-linear-135 from-[#ece9ff] via-[#f3f0ff] to-[#fff4e2] p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
          <div className="min-w-0 flex-1 basis-72">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-primary-subtle-foreground inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold tracking-[0.06em] uppercase">
                {container ? <FileStackIcon className="size-3.5" aria-hidden="true" /> : <SquareCheckIcon className="size-3.5" aria-hidden="true" />}
                {container ? 'Checklist page' : 'Checklist item'}
              </span>
              <span className="badge-soft badge-category">{node.nodeType}</span>
              <span className="badge-soft badge-neutral capitalize">{node.section ?? 'Needs mapping'}</span>
            </div>
            <h1 className="text-foreground mt-3 text-[1.625rem] leading-tight font-bold tracking-tight break-words lg:text-[2rem]">{node.title}</h1>
            <p className="text-muted-foreground mt-1 text-sm break-words">
              {d.task.taskTag} · {parent ? `Inside ${parent.title}` : 'Top level of the master checklist'}
            </p>
            {node.description ? <p className="text-foreground mt-3 text-sm whitespace-pre-wrap">{node.description}</p> : null}
          </div>
          <div className="grid w-full min-w-0 gap-2 rounded-2xl bg-white/85 p-4 shadow-(--shadow-card) sm:w-72">
            <div className="flex items-center justify-between gap-3">
              <p className="stat-figure">{container && !rows.length ? 'No items yet' : notApplicable ? 'Not applicable' : percentage(progress?.progressPercentage ?? null)}</p>
              <span
                className={cn(
                  'badge-soft',
                  result === 'CLOSED' ? 'badge-status-done' : result === 'N/A' ? 'badge-neutral' : 'bg-rose-50 text-rose-700',
                )}
              >
                Result: {result}
              </span>
            </div>
            <MissionProgress value={notApplicable ? null : (progress?.progressPercentage ?? null)} label={`${node.title} progress`} className="h-1.5" />
            <p className="text-muted-foreground text-xs">
              {container ? `${done} of ${rows.length} row${rows.length === 1 ? '' : 's'} complete` : progress?.isComplete ? 'Complete' : 'Pending'}
            </p>
          </div>
        </div>
        {estimate || elapsed || node.links.length ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-white/70 px-4 py-3 text-sm">
            {estimate ? <span className="inline-flex items-center gap-1.5"><HourglassIcon className="text-primary size-4" aria-hidden="true" />Estimated {estimate}</span> : null}
            {elapsed ? <span className="inline-flex items-center gap-1.5"><ClockIcon className="text-primary size-4" aria-hidden="true" />Logged {elapsed}</span> : null}
            {node.links.map((url, i) => (
              <a key={url + i} href={url} target="_blank" rel="noopener noreferrer" className="text-primary inline-flex max-w-full min-w-0 items-center gap-1.5 font-medium hover:underline">
                <ExternalLinkIcon className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{url}</span>
              </a>
            ))}
          </div>
        ) : null}
      </section>

      <div className={cn('mt-5 grid gap-5', canEdit && 'xl:grid-cols-[minmax(0,1fr)_22rem]')}>
        <main className="grid min-w-0 content-start gap-5">
          {!container && executor && open ? (
            <MissionPanel icon={SquareCheckIcon} title="Completion">
              <CompletionForm ctx={ctx} node={node} className="grid gap-1" />
            </MissionPanel>
          ) : null}

          {timeInfo.available && (canStart || elapsed || timeInfo.runningByNode.has(node.id)) ? (
            <MissionPanel
              icon={TimerIcon}
              title="Item timer"
              subtitle={`Stopping saves a task log tagged with this ${container ? 'page' : 'item'}, so the time counts in task hours, productivity and reports.`}
            >
              <div className="grid gap-3">
                <p className="text-sm">
                  <span className="text-muted-foreground">Logged here{container ? ' (including items inside)' : ''}: </span>
                  <span className="font-semibold tabular-nums">{elapsed ?? 'None yet'}</span>
                </p>
                <ItemTimerControls ctx={ctx} node={node} />
              </div>
            </MissionPanel>
          ) : null}

          <MissionPanel
            icon={ListChecksIcon}
            title={container ? 'Items on this page' : 'Sub-items'}
            subtitle={container ? 'Each row is an item or another page. Open a page to work inside it.' : 'Adding sub-items turns this item into a page whose progress rolls up from them.'}
          >
            <div className="grid gap-2">
              {rows.map(n => <ChecklistRow key={n.id} ctx={ctx} node={n} showSection={false} />)}
              {!rows.length ? <EmptyRows>{container ? 'This page has no items yet.' : 'No sub-items.'}</EmptyRows> : null}
            </div>
          </MissionPanel>
        </main>

        {canEdit ? (
          <aside className="grid min-w-0 content-start gap-5">
            <MissionPanel icon={PlusIcon} title={container ? 'Add to this page' : 'Add a sub-item'} subtitle="Choose Page to make a row that opens its own page.">
              <AddNodeForm ctx={ctx} parent={node} compact />
            </MissionPanel>
            <MissionPanel icon={PencilIcon} title={container ? 'Edit this page' : 'Edit this item'}>
              <EditNodeForms ctx={ctx} node={node} />
            </MissionPanel>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
