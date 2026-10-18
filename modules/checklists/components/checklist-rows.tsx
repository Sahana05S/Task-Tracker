import type * as React from 'react';
import Link from 'next/link';
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  CircleIcon,
  CircleMinusIcon,
  ClockIcon,
  CopyIcon,
  ExternalLinkIcon,
  FileStackIcon,
  HourglassIcon,
  PencilIcon,
  PlayIcon,
  SquareIcon,
  TimerIcon,
} from 'lucide-react';

import { RunningClock } from '@/modules/checklists/components/running-clock';
import { ExecutionForm } from '@/shared/ui/execution-form';
import { Button } from '@/shared/ui/button';
import { CHECKLIST_SECTIONS, type ChecklistRollup } from '@/modules/checklists/internal/progress';
import type { ChecklistItemTime } from '@/modules/checklists/internal/item-time';
import { childrenOf, checklistHref, formatMinutes, isContainer, subtreeSeconds } from '@/modules/checklists/internal/pages';
import { formatPercent } from '@/shared/tracker/format';
import { cn } from '@/shared/utils';
import type { ActionResponse, ChecklistNode, Task } from '@/types/tracker';

/**
 * Checklist rows shared by the master checklist and the nested checklist pages
 * (the sheet tracker's "[ChL]" tabs). Every node has its own page; Page and
 * Group nodes, and any node with children, are containers whose progress rolls
 * up from their direct children. Server-safe.
 */

export const FIELD = 'border-input bg-background w-full min-w-0 rounded-xl border px-3 text-sm';
export const LABEL = 'grid min-w-0 gap-1 text-sm';
export const LABEL_TEXT = 'text-foreground font-medium';

export interface ChecklistContext {
  action: (form: FormData) => Promise<ActionResponse<unknown>>;
  task: Pick<Task, 'id' | 'taskTag' | 'lifecycleVersion'>;
  nodes: readonly ChecklistNode[];
  rollup: ChecklistRollup;
  linkedTasksById: ReadonlyMap<string, { taskTag: string; status: string }>;
  /** Real tasks a manager may link (empty for everyone else). */
  choices: readonly { id: string; taskTag: string; title: string; progressPercentage: number | null; status: string }[];
  /** Managers: section mapping, links to real tasks and moving nodes. */
  manager: boolean;
  /** Managers and active assignees: completion and structure. */
  executor: boolean;
  /** Not archived, Done or Discarded. */
  open: boolean;
  /** Item timers (migration 34): logged time, running timers and the actions. */
  time?: {
    info: ChecklistItemTime;
    /** The signed-in user may start timers on this task. */
    canStart: boolean;
    start: (form: FormData) => Promise<ActionResponse<unknown>>;
    stop: (form: FormData) => Promise<ActionResponse<unknown>>;
    discard: (form: FormData) => Promise<ActionResponse<unknown>>;
  };
}

/** Logged item time for a node and everything inside it, or null when none. */
export function loggedTime(ctx: ChecklistContext, nodeId: string): string | null {
  if (!ctx.time?.info.available) return null;
  const seconds = subtreeSeconds(nodeId, ctx.nodes, ctx.time.info.secondsByNode);
  return seconds > 0 ? formatMinutes(Math.max(1, Math.round(seconds / 60))) : null;
}

/**
 * Start / stop / discard a timer on one checklist item. Stopping writes an
 * ordinary task log tagged with the item, so the time counts as task hours.
 */
export function ItemTimerControls({ ctx, node, compact }: { ctx: ChecklistContext; node: ChecklistNode; compact?: boolean }) {
  const time = ctx.time;
  if (!time?.info.available) return null;
  const mine = time.info.mine;
  const mineHere = mine && mine.nodeId === node.id && mine.taskId === ctx.task.id ? mine : null;
  const someoneElse = !mineHere ? time.info.runningByNode.get(node.id) : undefined;
  if (mineHere) {
    return (
      <div className={cn('grid min-w-0 gap-2', compact && 'justify-items-end')}>
        <p className="text-recognition-foreground bg-recognition-subtle inline-flex items-center gap-1.5 justify-self-start rounded-full px-2.5 py-1 text-xs font-semibold">
          <TimerIcon className="size-3.5" aria-hidden="true" />
          Timer running <RunningClock startedAt={mineHere.startedAt} />
        </p>
        <ExecutionForm action={time.stop} scope={`itemTimerStop:${mineHere.timerId}`} className="grid min-w-0 gap-2">
          <input type="hidden" name="timerId" value={mineHere.timerId} />
          <input type="hidden" name="expectedVersion" value={mineHere.version} />
          {compact ? null : <textarea name="notes" placeholder="What did you do? (saved on the task log)" aria-label="Timer notes" className={cn(FIELD, 'min-h-16 py-2')} />}
          <Button type="submit" size="sm" className="h-9 justify-self-start rounded-xl"><SquareIcon aria-hidden="true" />Stop and log time</Button>
        </ExecutionForm>
        {compact ? null : (
          <ExecutionForm action={time.discard} scope={`itemTimerDiscard:${mineHere.timerId}`} className="grid min-w-0 gap-2">
            <input type="hidden" name="timerId" value={mineHere.timerId} />
            <input type="hidden" name="expectedVersion" value={mineHere.version} />
            <input type="hidden" name="taskTag" value={ctx.task.taskTag} />
            <input name="reason" required placeholder="Reason for discarding" aria-label="Reason for discarding" className={cn(FIELD, 'h-9')} />
            <Button type="submit" variant="ghost" size="sm" className="justify-self-start rounded-xl">Discard timer</Button>
          </ExecutionForm>
        )}
      </div>
    );
  }
  if (someoneElse) {
    return (
      <p className="text-muted-foreground inline-flex items-center gap-1.5 text-xs">
        <TimerIcon className="size-3.5" aria-hidden="true" />A teammate's timer is running here
      </p>
    );
  }
  if (!time.canStart || !ctx.open) return null;
  if (mine) {
    return compact ? null : <p className="text-muted-foreground text-xs">Your timer is already running elsewhere. Stop it before timing this item.</p>;
  }
  return (
    <ExecutionForm action={time.start} scope={`itemTimerStart:${node.id}`} className="grid min-w-0 gap-2">
      <input type="hidden" name="nodeId" value={node.id} />
      {compact ? null : <textarea name="notes" placeholder="Optional note for the log" aria-label="Timer notes" className={cn(FIELD, 'min-h-16 py-2')} />}
      <Button type="submit" variant={compact ? 'outline' : 'default'} size="sm" className="h-9 justify-self-start rounded-xl"><PlayIcon aria-hidden="true" />Start timer</Button>
    </ExecutionForm>
  );
}

export const percentage = (p: number | null | undefined) =>
  p === null || p === undefined ? 'Unavailable' : formatPercent(p);

export { ancestry, checklistHref, childrenOf, formatMinutes, isContainer } from '@/modules/checklists/internal/pages';

/** Hidden identity fields every checklist command needs. */
export function CommandFields({ ctx, command }: { ctx: ChecklistContext; command: string }) {
  return (
    <>
      <input type="hidden" name="command" value={command} />
      <input type="hidden" name="taskId" value={ctx.task.id} />
      <input type="hidden" name="expectedVersion" value={ctx.task.lifecycleVersion ?? 0} />
    </>
  );
}

export function ReasonInput({ placeholder }: { placeholder: string }) {
  return <input name="reason" required placeholder={placeholder} aria-label={placeholder} className={cn(FIELD, 'h-10')} />;
}

export function SectionSelect({ selected = 'activity' }: { selected?: string | null }) {
  return (
    <label className={LABEL}>
      <span className={LABEL_TEXT}>Section</span>
      <select name="section" defaultValue={selected ?? 'activity'} required className={cn(FIELD, 'h-10')}>
        {CHECKLIST_SECTIONS.map(s => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
      </select>
    </label>
  );
}

export function ParentSelect({ ctx, selected, exclude }: { ctx: ChecklistContext; selected: string | null; exclude?: string }) {
  const groups = ctx.nodes.filter(n => ['Group', 'Page'].includes(n.nodeType) && !n.linkedTaskId && n.id !== exclude);
  return (
    <label className={LABEL}>
      <span className={LABEL_TEXT}>Parent</span>
      <select name="parent_id" defaultValue={selected ?? ''} className={cn(FIELD, 'h-10')}>
        <option value="">Section root</option>
        {groups.map(n => <option key={n.id} value={n.id}>{n.section ?? 'Needs mapping'} / {n.title}</option>)}
      </select>
    </label>
  );
}

export function LinkedTaskSelect({ ctx, selected }: { ctx: ChecklistContext; selected: string | null }) {
  return (
    <label className={LABEL}>
      <span className={LABEL_TEXT}>Linked real task</span>
      <select name="linked_task_id" defaultValue={selected ?? ''} className={cn(FIELD, 'h-10')}>
        <option value="">Ordinary checklist item</option>
        {ctx.choices.map(t => (
          <option key={t.id} value={t.id}>
            {t.taskTag} - {t.title} ({t.progressPercentage == null ? 'Unavailable' : t.progressPercentage + '%'}; {t.status})
          </option>
        ))}
      </select>
    </label>
  );
}

export function NodeTypeSelect({ label, selected, allowTask }: { label: string; selected?: string; allowTask: boolean }) {
  return (
    <label className={LABEL}>
      <span className={LABEL_TEXT}>{label}</span>
      <select name="node_type" defaultValue={selected} className={cn(FIELD, 'h-10')}>
        {['Item', 'Page', 'Group', ...(allowTask || selected === 'Task' ? ['Task'] : [])].map(t => <option key={t}>{t}</option>)}
      </select>
    </label>
  );
}

/** Links (one per line) and estimated minutes, as on the sheet's rows. */
export function RowDetailFields({ node }: { node?: ChecklistNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
      <label className={LABEL}>
        <span className={LABEL_TEXT}>Links</span>
        <textarea
          name="links"
          defaultValue={node?.links.join('\n') ?? ''}
          placeholder="https://… (one per line)"
          rows={2}
          className={cn(FIELD, 'min-h-10 py-2')}
        />
      </label>
      <label className={LABEL}>
        <span className={LABEL_TEXT}>Estimated minutes</span>
        <input
          name="estimated_minutes"
          type="number"
          min={0}
          max={100000}
          step={1}
          inputMode="numeric"
          defaultValue={node?.estimatedMinutes ?? ''}
          className={cn(FIELD, 'h-10 tabular-nums')}
        />
      </label>
    </div>
  );
}

/** Add a node under `parent` (or at the section root for the master checklist). */
export function AddNodeForm({
  ctx,
  parent,
  submitLabel = 'Add item',
  compact,
}: {
  ctx: ChecklistContext;
  parent: ChecklistNode | null;
  submitLabel?: string;
  compact?: boolean;
}) {
  return (
    <ExecutionForm action={ctx.action} scope={`add:${ctx.task.id}:${parent?.id ?? 'root'}`}>
      <CommandFields ctx={ctx} command="add" />
      <input name="title" required placeholder="Item title" aria-label="Item title" className={cn(FIELD, 'h-10')} />
      {compact ? null : <textarea name="description" placeholder="Instructions" aria-label="Instructions" className={cn(FIELD, 'min-h-20 py-2')} />}
      {parent ? (
        <>
          <input type="hidden" name="parent_id" value={parent.id} />
          <input type="hidden" name="section" value={parent.section ?? ''} />
          <NodeTypeSelect label="Type" selected="Item" allowTask={ctx.manager} />
        </>
      ) : (
        <>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <SectionSelect />
            <NodeTypeSelect label="Type" allowTask={ctx.manager} />
          </div>
          {ctx.manager ? <ParentSelect ctx={ctx} selected={null} /> : null}
        </>
      )}
      {ctx.manager ? <LinkedTaskSelect ctx={ctx} selected={null} /> : null}
      <RowDetailFields />
      <Button type="submit" className="rounded-xl">{submitLabel}</Button>
    </ExecutionForm>
  );
}

/**
 * Rename, links/estimate and (for managers) type, section, parent and real-task
 * link. Non-managers resend the stored placement so the command keeps it.
 */
export function EditNodeForms({ ctx, node }: { ctx: ChecklistContext; node: ChecklistNode }) {
  const hasChildren = ctx.nodes.some(c => c.parentNodeId === node.id);
  return (
    <div className="grid gap-4">
      {ctx.manager && !node.parentNodeId ? (
        <ExecutionForm action={ctx.action} scope={`map:${node.id}`}>
          <CommandFields ctx={ctx} command="map" />
          <input type="hidden" name="node_id" value={node.id} />
          <SectionSelect />
          <ReasonInput placeholder="Reason for explicit subtree mapping" />
          <Button type="submit" variant="outline" size="sm" className="h-auto min-h-8 justify-self-start rounded-xl whitespace-normal">Map this root and descendants</Button>
        </ExecutionForm>
      ) : null}
      <ExecutionForm action={ctx.action} scope={`edit:${node.id}`}>
        <CommandFields ctx={ctx} command="edit" />
        <input type="hidden" name="node_id" value={node.id} />
        <label className={LABEL}>
          <span className={LABEL_TEXT}>Title</span>
          <input name="title" defaultValue={node.title} required className={cn(FIELD, 'h-10')} />
        </label>
        {ctx.manager ? (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              <SectionSelect selected={node.section ?? null} />
              <NodeTypeSelect label="Node type" selected={node.nodeType} allowTask />
            </div>
            <ParentSelect ctx={ctx} selected={node.parentNodeId} exclude={node.id} />
            <LinkedTaskSelect ctx={ctx} selected={node.linkedTaskId} />
          </>
        ) : (
          <>
            <input type="hidden" name="section" value={node.section ?? ''} />
            <input type="hidden" name="parent_id" value={node.parentNodeId ?? ''} />
            <input type="hidden" name="linked_task_id" value={node.linkedTaskId ?? ''} />
            <NodeTypeSelect label="Node type" selected={node.nodeType} allowTask={false} />
          </>
        )}
        <RowDetailFields node={node} />
        <ReasonInput placeholder="Reason for structure/subtree section correction" />
        <Button type="submit" variant="outline" size="sm" className="justify-self-start rounded-xl">Correct structure</Button>
      </ExecutionForm>
      {!node.linkedTaskId && node.section ? (
        <ExecutionForm action={ctx.action} scope={`duplicate:${node.id}`}>
          <CommandFields ctx={ctx} command="duplicate" />
          <input type="hidden" name="node_id" value={node.id} />
          <p className="text-muted-foreground text-xs">
            {hasChildren ? 'Copies this page and everything inside it' : 'Copies this row'}, right after it, as fresh work (No). Rows linked to real tasks are not copied.
          </p>
          <Button type="submit" variant="outline" size="sm" className="justify-self-start rounded-xl"><CopyIcon aria-hidden="true" />Duplicate</Button>
        </ExecutionForm>
      ) : null}
      {!hasChildren ? (
        <ExecutionForm action={ctx.action} scope={`delete:${node.id}`}>
          <CommandFields ctx={ctx} command="delete" />
          <input type="hidden" name="node_id" value={node.id} />
          <ReasonInput placeholder="Reason for removal" />
          <Button type="submit" variant="ghost" size="sm" className="justify-self-start rounded-xl text-rose-700 hover:text-rose-800">Remove item</Button>
        </ExecutionForm>
      ) : (
        <p className="text-muted-foreground text-xs">Remove or move the items inside before removing this page.</p>
      )}
    </div>
  );
}

/** Yes / No / N/A for a leaf; linked real tasks only toggle applicability. */
export function CompletionForm({ ctx, node, className }: { ctx: ChecklistContext; node: ChecklistNode; className?: string }) {
  return (
    <ExecutionForm action={ctx.action} scope={`state:${node.id}`} className={className}>
      <CommandFields ctx={ctx} command="state" />
      <input type="hidden" name="node_id" value={node.id} />
      <div className="flex min-w-0 flex-wrap items-end gap-2">
        <label className="grid min-w-0 flex-1 gap-1 text-xs sm:flex-none">
          <span className="text-muted-foreground font-medium">Completion</span>
          <select name="state" defaultValue={node.completionState ?? 'No'} className={cn(FIELD, 'h-9 sm:w-28')}>
            {(node.linkedTaskId ? ['No', 'N/A'] : ['Yes', 'No', 'N/A']).map(s => <option key={s}>{s}</option>)}
          </select>
        </label>
        <Button type="submit" size="sm" className="h-9 rounded-xl">Save state</Button>
      </div>
      {node.linkedTaskId ? <p className="text-muted-foreground max-w-60 text-xs">No restores applicability; completion follows the linked task.</p> : null}
    </ExecutionForm>
  );
}

export function NodeStateIcon({ ctx, node, className }: { ctx: ChecklistContext; node: ChecklistNode; className?: string }) {
  const v = ctx.rollup.nodeProgress.find(p => p.id === node.id);
  const container = isContainer(node, ctx.nodes);
  const Icon = v?.applicable === false ? CircleMinusIcon : v?.isComplete ? CheckCircle2Icon : container ? FileStackIcon : CircleIcon;
  return (
    <Icon
      className={cn(
        'size-5 shrink-0',
        v?.applicable === false ? 'text-muted-foreground' : v?.isComplete ? 'text-success-strong' : container ? 'text-primary' : 'text-slate-300',
        className,
      )}
      aria-hidden="true"
    />
  );
}

/** One checklist row: the sheet's Checkbox / Type / Progress / Item / Links / Time columns. */
export function ChecklistRow({ ctx, node: n, showSection = true }: { ctx: ChecklistContext; node: ChecklistNode; showSection?: boolean }) {
  const v = ctx.rollup.nodeProgress.find(p => p.id === n.id);
  const parent = ctx.nodes.find(p => p.id === n.parentNodeId);
  const container = isContainer(n, ctx.nodes);
  const inside = childrenOf(n.id, ctx.nodes).length;
  const leaf = !container;
  const linked = ctx.linkedTasksById.get(n.linkedTaskId ?? '');
  const estimate = formatMinutes(n.estimatedMinutes);
  const elapsed = loggedTime(ctx, n.id);
  const href = checklistHref(ctx.task.taskTag, n.id);
  return (
    <article
      className={cn(
        'border-border grid gap-3 rounded-xl border p-3 sm:p-4',
        container ? 'bg-primary-subtle/40' : v?.isComplete ? 'bg-emerald-50/40' : 'bg-card',
      )}
    >
      <div className="flex min-w-0 flex-wrap items-start gap-x-3 gap-y-3">
        <NodeStateIcon ctx={ctx} node={n} className="mt-0.5" />
        <div className="min-w-0 flex-1 basis-48">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Link href={href} className={cn('text-foreground decoration-primary/40 break-words underline-offset-4 hover:underline', container ? 'font-bold' : 'font-medium')}>
              {n.title}
            </Link>
            <span className="badge-soft badge-category">{n.nodeType}</span>
          </div>
          <p className="text-muted-foreground mt-0.5 text-xs break-words">
            {showSection ? (n.section ?? 'Unsectioned - manager review needed') : null}
            {showSection && parent ? ` / ${parent.title}` : ''}
            {showSection ? ' - ' : ''}
            {v?.applicable === false ? 'Not applicable' : percentage(v?.progressPercentage ?? null)} - {v?.isComplete ? 'Complete' : 'Pending'}
          </p>
          {container || estimate || elapsed || n.links.length ? (
            <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {container ? (
                <Link href={href} className="text-primary inline-flex items-center gap-1 font-semibold hover:underline">
                  {inside} item{inside === 1 ? '' : 's'} inside
                  <ChevronRightIcon className="size-3.5" aria-hidden="true" />
                </Link>
              ) : null}
              {estimate ? (
                <span className="inline-flex items-center gap-1"><HourglassIcon className="size-3.5" aria-hidden="true" />Est. {estimate}</span>
              ) : null}
              {elapsed ? (
                <span className="inline-flex items-center gap-1"><ClockIcon className="size-3.5" aria-hidden="true" />Elapsed {elapsed}</span>
              ) : null}
              {n.links.map((url, i) => (
                <a key={url + i} href={url} target="_blank" rel="noopener noreferrer" className="text-primary inline-flex max-w-full items-center gap-1 font-medium hover:underline">
                  <ExternalLinkIcon className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{linkLabel(url)}</span>
                </a>
              ))}
            </div>
          ) : null}
          {linked ? (
            <Link href={`/tasks/${encodeURIComponent(linked.taskTag)}`} className="text-primary mt-1 inline-flex items-center gap-1 text-xs font-semibold hover:underline">
              {linked.taskTag} - {linked.status}
              <ArrowRightIcon className="size-3" aria-hidden="true" />
            </Link>
          ) : n.linkedTaskId ? (
            <p className="text-attention-foreground mt-1 text-xs">Linked task unavailable; a manager must repair the reference.</p>
          ) : null}
        </div>
        {leaf && ((ctx.executor && ctx.open) || ctx.time?.info.runningByNode.has(n.id)) ? (
          <div className="grid min-w-0 gap-2 max-sm:w-full sm:justify-items-end">
            {ctx.executor && ctx.open ? <CompletionForm ctx={ctx} node={n} className="grid min-w-0 gap-1 sm:justify-items-end" /> : null}
            <ItemTimerControls ctx={ctx} node={n} compact />
          </div>
        ) : null}
      </div>
      {ctx.executor && ctx.open ? (
        <details className="border-border rounded-lg border border-dashed">
          <summary className="text-primary flex cursor-pointer items-center gap-1.5 px-3 py-2 text-xs font-semibold select-none">
            <PencilIcon className="size-3.5" aria-hidden="true" />
            {ctx.manager ? 'Structure / legacy correction' : 'Edit item'}
          </summary>
          <div className="border-t border-dashed px-3 py-3">
            <EditNodeForms ctx={ctx} node={n} />
          </div>
        </details>
      ) : null}
    </article>
  );
}

function linkLabel(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') + (u.pathname.length > 1 ? '/…' : '');
  } catch {
    return url;
  }
}

export function EmptyRows({ children }: { children: React.ReactNode }) {
  return <p className="soft-inset text-muted-foreground px-4 py-6 text-center text-sm">{children}</p>;
}
