'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, ChevronDownIcon, ChevronRightIcon, CircleIcon, FocusIcon, ListIcon, OrbitIcon, RotateCcwIcon, XIcon } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { PriorityBadge } from '@/shared/ui/tracker-badges';
import { cn } from '@/shared/utils';
import { missionDueLabel, type MissionDueFilter, type RoadmapMission, type RoadmapMissionBatch } from '@/modules/tasks/client';
import type { ChecklistBranch, ChecklistBranchOptions, ChecklistBranchRow } from '@/modules/checklists/client';
import { branchForRow, roadmapSearch, type RoadmapLocation } from '@/modules/workspace-views/client';
import { loadRoadmapBranch, loadRoadmapMissions } from '@/modules/workspace-views/roadmap-actions';
import { MissionMap } from './mission-map';

const RoadmapItemWork = dynamic(() => import('./roadmap-item-work').then(m => m.RoadmapItemWork), {
  loading: () => <p role="status" className="text-muted-foreground py-4 text-sm">Preparing work controls…</p>,
});
const FOCUS = 'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 outline-none';
const SECTIONS = ['setup', 'activity', 'closure'] as const;

type View = 'roadmap' | 'list';
interface Props {
  initial: RoadmapMissionBatch | null;
  due: MissionDueFilter;
  today: string;
  initialView?: View;
  initialLocation?: RoadmapLocation | null;
}
function remember(location: RoadmapLocation | null, due: string, view: View) {
  window.history.replaceState(null, '', roadmapSearch(location, due, view));
}
function Progress({ value }: { value: number | null }) {
  return <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{value === null ? 'Progress unavailable' : `${Math.round(value)}%`}</span>;
}
function LoadingBranch() {
  return <div role="status" className="space-y-3 py-5"><span className="sr-only">Loading checklist…</span>{[1, 2, 3].map(n => <div key={n} className="bg-muted h-16 rounded-xl motion-safe:animate-pulse" />)}</div>;
}

/** The map view and a keyboard-first list over the same bounded data, actions and URL location. */
export function MissionRoadmap({ initial, due, today, initialView = 'roadmap', initialLocation = null }: Props) {
  const [batch, setBatch] = useState(initial);
  const [view, setView] = useState<View>(initialView);
  const [location, setLocation] = useState<RoadmapLocation | null>(initialLocation);
  const [mission, setMission] = useState<RoadmapMission | null>(null);
  const [branch, setBranch] = useState<ChecklistBranch | null>(null);
  const [selected, setSelected] = useState<ChecklistBranchRow | null>(null);
  const [error, setError] = useState<string | null>(initial ? null : 'Your missions could not be loaded. Retry your roadmap.');
  const [batchError, setBatchError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [loadingMore, startMore] = useTransition();
  const [revision, setRevision] = useState(0);
  const request = useRef(0);
  const panelHeading = useRef<HTMLHeadingElement>(null);

  function open(path: RoadmapLocation, append = false) {
    const sequence = ++request.current;
    setLocation(path);
    setError(null);
    if (!append) { setBranch(null); setSelected(null); }
    remember(path, due, view);
    startTransition(async () => {
      const result = await loadRoadmapBranch(path.missionId, { checklistId: path.checklistId, parentNodeId: path.parentNodeId, section: path.section ?? 'activity', cursor: append ? branch?.nextCursor ?? 0 : path.cursor ?? 0, limit: 20 });
      if (sequence !== request.current) return;
      if (!result.success || !result.data) { setError(result.error ?? 'Your checklist is unavailable. Retry this branch.'); return; }
      setMission(result.data.mission);
      const next = result.data.branch;
      if (append && branch && next && branch.taskVersion !== next.taskVersion) { open({ ...path, cursor: 0, nodeId: undefined }); return; }
      setBranch(previous => append && previous && next ? { ...next, rows: [...previous.rows, ...next.rows] } : next);
      if (path.nodeId && next) setSelected(next.rows.find(row => row.id === path.nodeId) ?? null);
    });
  }
  // A URL is a restorable location, including a focused branch, rather than a pixel position.
  useEffect(() => { if (initialLocation && initialView === 'list') open(initialLocation); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (selected) panelHeading.current?.focus(); }, [selected?.id]);

  function overview() {
    request.current++;
    setLocation(null); setMission(null); setBranch(null); setSelected(null); setError(null);
    remember(null, due, view);
  }
  function select(row: ChecklistBranchRow, _trigger: HTMLButtonElement, offset: number) {
    if (!location) return;
    open({ missionId: location.missionId, checklistId: row.checklistId,
      parentNodeId: row.parentNodeId ?? undefined, section: row.section ?? 'activity',
      nodeId: row.id, cursor: Math.floor(offset / 20) * 20 });
  }
  function closePanel() {
    setSelected(null);
    if (location) remember({ ...location, nodeId: undefined }, due, view);
    if (selected) requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`button[data-roadmap-node="${selected.id}"]`)?.focus());
  }
  function refreshBranch() {
    if (!location) return;
    const selectedId = selected?.id;
    setRevision(n => n + 1);
    open({ ...location, nodeId: selectedId });
  }
  function loadMoreMissions(retry = false) {
    setBatchError(null);
    startMore(async () => {
      const result = await loadRoadmapMissions({ due, cursor: retry ? null : batch?.nextCursor });
      if (!result.success || !result.data) { setBatchError(result.error ?? 'This batch could not be loaded. Retry.'); return; }
      setBatch(previous => ({ ...result.data!, missions: retry ? result.data!.missions : [...new Map([...(previous?.missions ?? []), ...result.data!.missions].map(m => [m.id, m])).values()] }));
      setError(null);
    });
  }

  return <section aria-labelledby="mission-path-title" className="min-w-0">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="mission-path-title" className="text-foreground text-xl font-bold tracking-tight">Your mission path</h2><p className="text-muted-foreground mt-1 max-w-prose text-sm">Choose a mission. Open its next item. Keep your work in focus.</p></div>
      <div className="border-border flex rounded-full border p-1" role="group" aria-label="Mission view">
        <Button size="sm" variant={view === 'roadmap' ? 'default' : 'ghost'} aria-pressed={view === 'roadmap'} onClick={() => { setView('roadmap'); remember(location, due, 'roadmap'); }}><OrbitIcon aria-hidden="true" />Roadmap</Button>
        <Button size="sm" variant={view === 'list' ? 'default' : 'ghost'} aria-pressed={view === 'list'} onClick={() => { setView('list'); remember(location, due, 'list'); if (location) open(location); }}><ListIcon aria-hidden="true" />List</Button>
      </div>
    </div>
    <nav aria-label="Mission deadline filters" className="mt-5 flex flex-wrap gap-2">
      {([['all', 'All open'], ['today', 'Due today'], ['overdue', 'Overdue']] as const).map(([value, label]) => <Link key={value} href={roadmapSearch(null, value, view)} onClick={() => { if (value === due) overview(); }} aria-current={due === value ? 'page' : undefined} className={cn('rounded-full px-3.5 py-2 text-sm font-medium transition-colors', FOCUS, due === value ? 'bg-primary-subtle text-primary-subtle-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>{label}</Link>)}
    </nav>
    {view === 'roadmap' ? <>
      {error ? <div role="alert" className="border-attention-border bg-attention-subtle text-attention-foreground mt-5 rounded-xl border p-4 text-sm"><p>{error}</p><Button size="sm" variant="outline" className="mt-3" onClick={() => loadMoreMissions(true)} disabled={loadingMore}><RotateCcwIcon aria-hidden="true" />Retry roadmap</Button></div> : null}
      {batch?.missions.length || location ? <MissionMap missions={batch?.missions ?? []} today={today} initialLocation={location}
        onLocation={next => { setLocation(next); remember(next, due, 'roadmap'); }} />
        : batch ? <p className="text-muted-foreground py-8 text-sm">{due === 'all' ? 'No open missions are assigned to you.' : due === 'today' ? 'No open assigned missions are due today.' : 'No open assigned missions are overdue.'} <Link href="/tasks" className="text-primary font-semibold hover:underline">Browse missions</Link></p> : null}
      {batch?.hasMore ? <Button className="mt-4" variant="outline" disabled={loadingMore} onClick={() => loadMoreMissions()}>{loadingMore ? 'Loading missions…' : `Load more missions (${batch.missions.length} shown)`}</Button> : null}
      {batchError ? <p role="alert" className="text-destructive mt-3 text-sm">{batchError} <button type="button" className={cn('rounded font-semibold underline', FOCUS)} disabled={loadingMore} onClick={() => loadMoreMissions()}>Retry batch</button></p> : null}
    </> : <>
    {location ? <nav aria-label="Roadmap breadcrumb" className="border-border mt-5 border-t pt-4">
      <ol className="text-muted-foreground flex flex-wrap items-center gap-x-1 gap-y-2 text-xs">
        <li><button type="button" onClick={overview} className={cn('hover:text-primary rounded px-1 py-1 font-medium', FOCUS)}>My missions</button></li>
        <li aria-hidden="true"><ChevronRightIcon className="size-3.5" /></li>
        <li><button type="button" className={cn('text-foreground hover:text-primary max-w-60 truncate rounded px-1 py-1 font-semibold', FOCUS)} onClick={() => open({ missionId: location.missionId })}>{mission?.taskTag ?? 'Mission'}</button></li>
        {branch?.ancestors.map(ancestor => <li key={ancestor.nodeId} className="flex min-w-0 items-center gap-1"><ChevronRightIcon className="size-3.5 shrink-0" aria-hidden="true" /><button type="button" onClick={() => open({ missionId: location.missionId, ...branchForRow({ id: ancestor.nodeId, checklistId: ancestor.checklistId, ownedChecklistId: ancestor.ownedChecklistId }) })} className={cn('hover:text-primary max-w-48 truncate rounded px-1 py-1', FOCUS)}>{ancestor.title}</button></li>)}
      </ol>
    </nav> : null}
    <div className={cn('mt-4 grid min-w-0 gap-5', selected && 'xl:grid-cols-[minmax(0,1fr)_340px]')}>
      <div className="border-border bg-card min-w-0 rounded-2xl border">
        {location && mission ? <div className="border-border flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4 sm:px-5">
          <div className="min-w-0"><h3 className="text-foreground break-words text-base font-semibold">{mission.title}</h3><p className="text-muted-foreground mt-1 text-xs">{missionDueLabel(mission.dueDate, today)} · {mission.taskTag}</p></div>
          <Link href={`/tasks/${encodeURIComponent(mission.taskTag)}`} className={cn('text-primary rounded text-xs font-semibold underline-offset-4 hover:underline', FOCUS)}>Mission details</Link>
        </div> : null}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
          {location ? <div role="group" aria-label="Checklist sections" className="bg-muted flex rounded-full p-1">
            {SECTIONS.map(section => <Button key={section} size="sm" variant={(location.section ?? 'activity') === section ? 'default' : 'ghost'} aria-pressed={(location.section ?? 'activity') === section} disabled={pending} onClick={() => open({ ...location, parentNodeId: undefined, nodeId: undefined, section })}>{section[0].toUpperCase() + section.slice(1)}</Button>)}
          </div> : <p className="text-muted-foreground text-xs">{batch ? `${batch.missions.length} open ${batch.missions.length === 1 ? 'mission' : 'missions'} loaded${batch.hasMore ? ' · more below' : ''}` : 'Your open assigned missions'}</p>}
        </div>
        <div className="min-w-0 overflow-x-auto px-4 pb-5 sm:px-5" aria-busy={pending || loadingMore}>
          {error ? <div role="alert" className="border-attention-border bg-attention-subtle text-attention-foreground my-5 rounded-xl border p-4 text-sm"><p>{error}</p><Button size="sm" variant="outline" className="mt-3" onClick={() => location ? open(location) : loadMoreMissions(true)} disabled={pending || loadingMore}><RotateCcwIcon aria-hidden="true" />Retry {location ? 'branch' : 'roadmap'}</Button></div> : null}
          {location ? pending && !branch ? <LoadingBranch /> : branch?.checklist ? <div className="pt-4">
            {branch.rows.length ? <RoadmapRows baseCursor={location.cursor ?? 0} key={`${location.missionId}:${branch.checklist.id}:${branch.parentNodeId}:${branch.section}:${revision}`} rows={branch.rows} missionId={location.missionId} view={view} selectedId={selected?.id} onSelect={select} onZoom={options => open({ missionId: location.missionId, ...options })} /> : <p className="text-muted-foreground py-8 text-sm">No items in this {branch.section} branch. Add items from the mission checklist.</p>}
            {branch.hasMore ? <Button variant="outline" size="sm" disabled={pending} onClick={() => open(location, true)} className="mt-4">{pending ? 'Loading…' : 'Load more items'}</Button> : null}
          </div> : !pending && !error ? <p className="text-muted-foreground py-8 text-sm">This mission does not have a checklist yet. <Link href={`/tasks/${encodeURIComponent(mission?.taskTag ?? '')}`} className="text-primary font-semibold hover:underline">Open mission details</Link> to set one up.</p> : null
            : <div className="pt-4">
              {batch?.missions.length ? <ol className="divide-border divide-y" aria-label="Your open assigned missions">{batch.missions.map(item => <li key={item.id} className="relative min-w-0" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 106px' }}>
                <button type="button" onClick={() => { setMission(item); open({ missionId: item.id }); }} className={cn('group text-left w-full min-w-0 py-3 hover:bg-muted rounded-lg px-2 transition-colors', FOCUS)}>
                  <span className="flex items-start justify-between gap-3"><span className="text-foreground min-w-0 break-words text-sm font-semibold">{item.title}</span><ArrowRightIcon className="text-muted-foreground group-hover:text-primary mt-0.5 size-4 shrink-0" aria-hidden="true" /></span>
                  <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2"><PriorityBadge priority={item.priority} /><span className={cn('text-xs', item.dueDate && item.dueDate < today ? 'text-destructive' : 'text-muted-foreground')}>{missionDueLabel(item.dueDate, today)}</span><Progress value={item.progress} /><span className="text-muted-foreground text-xs">{item.taskTag}</span></span>
                </button>
              </li>)}</ol> : batch ? <p className="text-muted-foreground py-8 text-sm">{due === 'all' ? 'No open missions are assigned to you.' : due === 'today' ? 'No open assigned missions are due today.' : 'No open assigned missions are overdue.'} <Link href="/tasks" className="text-primary font-semibold hover:underline">Browse missions</Link></p> : null}
            </div>}
          {!location && batch?.hasMore ? <Button className="mt-5 w-full" variant="outline" disabled={loadingMore} onClick={() => loadMoreMissions()}>{loadingMore ? 'Loading missions…' : 'Load more missions'}</Button> : null}
          {batchError ? <p role="alert" className="text-destructive mt-3 text-sm">{batchError} <button type="button" className={cn('rounded font-semibold underline', FOCUS)} disabled={loadingMore} onClick={() => loadMoreMissions()}>Retry batch</button></p> : null}
        </div>
      </div>
      {selected && mission && branch?.checklist ? <aside aria-labelledby="focused-work-title" className="border-border bg-card h-fit min-w-0 rounded-2xl border p-5 xl:sticky xl:top-6">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 ref={panelHeading} id="focused-work-title" tabIndex={-1} className="text-foreground break-words text-lg font-semibold outline-none">{selected.title}</h3></div><Button variant="ghost" size="icon" className="size-8" aria-label="Close focused work" onClick={closePanel}><XIcon aria-hidden="true" /></Button></div>
        <RoadmapItemWork key={`${selected.id}:${branch.taskVersion}`} mission={{ ...mission, lifecycleVersion: branch.taskVersion }} node={selected} onOpen={() => open({ missionId: mission.id, ...branchForRow(selected) })} onCommitted={refreshBranch} />
      </aside> : null}
    </div>
    {location ? <Button variant="ghost" size="sm" onClick={overview} className="mt-4"><ArrowLeftIcon aria-hidden="true" />All my missions</Button> : null}
    </>}
  </section>;
}

function RoadmapRows({ rows, missionId, view, selectedId, onSelect, onZoom, baseCursor = 0 }: {
  rows: ChecklistBranchRow[]; missionId: string; view: View; selectedId?: string; baseCursor?: number;
  onSelect: (row: ChecklistBranchRow, trigger: HTMLButtonElement, offset: number) => void;
  onZoom: (options: ChecklistBranchOptions) => void;
}) {
  return <ol aria-label="Checklist items" className="space-y-1">{rows.map((row, index) => <BranchRow offset={baseCursor + index} key={row.id} row={row} missionId={missionId} view={view} selectedId={selectedId} onSelect={onSelect} onZoom={onZoom} />)}</ol>;
}
function BranchRow({ row, missionId, view, selectedId, onSelect, onZoom, offset }: {
  row: ChecklistBranchRow; missionId: string; view: View; selectedId?: string; offset: number;
  onSelect: (row: ChecklistBranchRow, trigger: HTMLButtonElement, offset: number) => void;
  onZoom: (options: ChecklistBranchOptions) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [branch, setBranch] = useState<ChecklistBranch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const options = branchForRow(row);
  const expandable = row.childCount > 0 || row.isSubMission || ['Page', 'Group'].includes(row.nodeType);
  function load(append = false) {
    setError(null);
    startTransition(async () => {
      const result = await loadRoadmapBranch(missionId, { ...options, cursor: append ? branch?.nextCursor ?? 0 : 0, limit: 20 });
      if (!result.success) { setError(result.error ?? 'This branch is unavailable. Retry.'); return; }
      const next = result.data?.branch ?? null;
      if (append && branch && next && branch.taskVersion !== next.taskVersion) { load(); return; }
      setBranch(previous => append && previous && next ? { ...next, rows: [...previous.rows, ...next.rows] } : next);
    });
  }
  return <li className={cn('min-w-0', view === 'roadmap' && 'relative pl-7')}>
    {view === 'roadmap' ? <span aria-hidden="true" className="border-border absolute top-5 bottom-0 left-2 border-l border-dashed" /> : null}
    <div className={cn('flex min-w-0 items-start gap-1 rounded-xl px-1 py-1', selectedId === row.id ? 'bg-primary-subtle/60' : 'hover:bg-muted/70')}>
      {view === 'roadmap' ? <span aria-hidden="true" className={cn('bg-card text-muted-foreground absolute top-4 left-0 flex size-4 items-center justify-center', row.isComplete && 'text-success-strong')}>{row.isComplete ? <CheckIcon className="size-4" /> : <CircleIcon className="size-3" />}</span> : null}
      {expandable ? <Button variant="ghost" size="icon" className="mt-1 size-8" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${row.title}`} aria-expanded={expanded} disabled={pending} onClick={() => { setExpanded(!expanded); if (!expanded && !branch) load(); }}>{expanded ? <ChevronDownIcon className="size-4" aria-hidden="true" /> : <ChevronRightIcon className="size-4" aria-hidden="true" />}</Button> : <span className="w-8 shrink-0" aria-hidden="true" />}
      <button type="button" data-roadmap-node={row.id} onClick={event => onSelect(row, event.currentTarget, offset)} aria-pressed={selectedId === row.id} className={cn('grid min-w-0 flex-1 gap-1.5 rounded-lg px-1 py-2 text-left', FOCUS)}><span className="text-foreground break-words text-sm font-medium">{row.title}</span><span className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">{row.isSubMission ? <span className="text-primary-subtle-foreground font-semibold">Sub-mission</span> : null}{row.isSubMission && row.priority > 0 ? <span>Priority {row.priority}</span> : null}<span>{row.applicable ? row.isComplete ? 'Complete' : 'In progress' : 'N/A'}</span><Progress value={row.progressPercentage} />{row.childCount ? <span>{row.childCount} items</span> : null}</span></button>
      {expandable ? <Button variant="ghost" size="icon" className="mt-1 size-8" aria-label={`Focus ${row.title} branch`} onClick={() => onZoom(options)}><FocusIcon className="size-4" aria-hidden="true" /></Button> : null}
    </div>
    {expanded ? <div className="border-border ml-4 min-w-0 border-l pl-2 sm:pl-3">
      {pending && !branch ? <LoadingBranch /> : null}
      {error ? <p role="alert" className="text-destructive py-3 text-sm">{error} <button type="button" onClick={() => load()} className={cn('rounded underline', FOCUS)}>Retry branch</button></p> : null}
      {branch ? branch.rows.length ? <RoadmapRows rows={branch.rows} missionId={missionId} view={view} selectedId={selectedId} onSelect={onSelect} onZoom={onZoom} /> : <p className="text-muted-foreground py-3 text-xs">No activity items inside this branch.</p> : null}
      {branch?.hasMore ? <Button variant="ghost" size="sm" disabled={pending} onClick={() => load(true)}>{pending ? 'Loading…' : 'Load more items'}</Button> : null}
    </div> : null}
  </li>;
}
