'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { ArrowUpLeftIcon, CheckIcon, ChevronRightIcon, CircleIcon, HouseIcon, LayersIcon, MinusIcon, OrbitIcon, PlusIcon, RotateCcwIcon, SparklesIcon, XIcon } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/utils';
import { missionDueLabel, type RoadmapMission } from '@/modules/tasks/client';
import { checklistWorkHref, type ChecklistBranch, type ChecklistBranchOptions, type ChecklistBranchRow, type ChecklistSection } from '@/modules/checklists/client';
import { checklistCommand } from '@/modules/checklists/actions';
import { branchForRow, layoutMissionMap, mapCamera, type Camera, type MapEntity, type MapLevel, type MapNode, type RoadmapLocation } from '@/modules/workspace-views/client';
import { loadRoadmapBranch } from '@/modules/workspace-views/roadmap-actions';
import styles from './mission-map.module.css';

const RoadmapItemWork = dynamic(() => import('./roadmap-item-work').then(m => m.RoadmapItemWork), {
  loading: () => <p role="status" className="text-muted-foreground py-4 text-sm">Preparing work controls…</p>,
});
const SECTIONS: ChecklistSection[] = ['setup', 'activity', 'closure'];
const BATCH = 20;

/** One opened node on the path: the mission, then each opened Sub-mission or page. */
interface Step { id: string; title: string; missionId: string; options: ChecklistBranchOptions }
interface Level { branch?: ChecklistBranch; error?: string; loading?: boolean }

function missionStep(m: Pick<RoadmapMission, 'id' | 'title'>, options: ChecklistBranchOptions = { section: 'activity' }): Step {
  return { id: m.id, title: m.title, missionId: m.id, options };
}
function rowStep(row: Pick<ChecklistBranchRow, 'id' | 'title' | 'checklistId' | 'ownedChecklistId' | 'section'>, missionId: string): Step {
  const options = branchForRow(row);
  return { id: row.id, title: row.title, missionId, options: { ...options, section: options.section ?? row.section ?? 'activity' } };
}
const isContainer = (row: ChecklistBranchRow) => row.isSubMission || row.childCount > 0 || ['Page', 'Group'].includes(row.nodeType);
const pct = (value: number | null) => value === null ? 'Not started' : `${Math.round(value)}%`;

export function MissionMap({ missions, today, initialLocation, onLocation }: {
  missions: RoadmapMission[];
  today: string;
  initialLocation: RoadmapLocation | null;
  onLocation: (location: RoadmapLocation | null) => void;
}) {
  const [path, setPath] = useState<Step[]>([]);
  const [leafId, setLeafId] = useState<string | null>(null);
  const [levels, setLevels] = useState<Record<string, Level>>({});
  const [found, setFound] = useState<Record<string, RoadmapMission>>({});
  // Null until the first aim; render then derives it so server HTML already shows the road.
  const [aimed, setCamera] = useState<Camera | null>(null);
  const [free, setFree] = useState(false);
  const [size, setSize] = useState({ w: 800, h: 520 });
  const [dragging, setDragging] = useState(false);
  const [restoring, setRestoring] = useState(!!initialLocation);
  const [cardBusy, setCardBusy] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const frame = useRef<HTMLElement>(null);
  const panelHeading = useRef<HTMLHeadingElement>(null);
  const levelsRef = useRef(levels);
  const sequence = useRef<Record<string, number>>({});
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  levelsRef.current = levels;

  // Missions in the loaded batch, plus a deep-linked mission from a later batch.
  const roots = useMemo(() => {
    const list = missions.map(m => found[m.id] ?? m);
    for (const extra of Object.values(found)) if (!list.some(m => m.id === extra.id) && path[0]?.id === extra.id) list.push(extra);
    return list;
  }, [missions, found, path]);
  const rows = useMemo(() => {
    const all = new Map<string, ChecklistBranchRow>();
    for (const level of Object.values(levels)) for (const row of level.branch?.rows ?? []) all.set(row.id, row);
    return all;
  }, [levels]);

  async function fetchLevel(step: Step, append = false) {
    const seq = (sequence.current[step.id] ?? 0) + 1;
    sequence.current[step.id] = seq;
    const previous = levelsRef.current[step.id]?.branch;
    setLevels(p => ({ ...p, [step.id]: { branch: p[step.id]?.branch, loading: true } }));
    const result = await loadRoadmapBranch(step.missionId, { ...step.options, cursor: append ? previous?.nextCursor ?? 0 : step.options.cursor ?? 0, limit: BATCH });
    if (sequence.current[step.id] !== seq) return null;
    if (!result.success || !result.data) {
      setLevels(p => ({ ...p, [step.id]: { branch: p[step.id]?.branch, error: result.error ?? 'This branch could not be loaded.' } }));
      return null;
    }
    const { mission, branch } = result.data;
    setFound(p => ({ ...p, [mission.id]: mission }));
    const next = append && previous && branch && previous.taskVersion === branch.taskVersion ? { ...branch, rows: [...previous.rows, ...branch.rows] } : branch;
    setLevels(p => ({ ...p, [step.id]: { branch: next ?? undefined } }));
    return next;
  }
  /** After a write, reread only the open branches (bounded) instead of the whole page. */
  function refreshPath() { for (const step of path) void fetchLevel(step); }

  // Restore a deep link: read the deepest branch, then rebuild the opened path from its ancestors.
  useEffect(() => {
    if (!initialLocation) return;
    (async () => {
      const loc = initialLocation;
      const result = await loadRoadmapBranch(loc.missionId, { checklistId: loc.checklistId, parentNodeId: loc.parentNodeId, section: loc.section ?? 'activity', cursor: loc.cursor ?? 0, limit: BATCH });
      setRestoring(false);
      if (!result.success || !result.data?.branch) { onLocation(null); return; }
      const { mission, branch } = result.data;
      setFound(p => ({ ...p, [mission.id]: mission }));
      const ancestors = branch.ancestors.map(a => rowStep({ id: a.nodeId, title: a.title, checklistId: a.checklistId, ownedChecklistId: a.ownedChecklistId, section: loc.section ?? 'activity' }, mission.id));
      const steps = [missionStep(mission), ...ancestors];
      const deepest = steps.length - 1;
      steps[deepest] = { ...steps[deepest], options: { ...steps[deepest].options, section: loc.section ?? 'activity', cursor: loc.cursor ?? 0 } };
      setLevels(p => ({ ...p, [steps[deepest].id]: { branch } }));
      setPath(steps);
      setLeafId(loc.nodeId && branch.rows.some(r => r.id === loc.nodeId) ? loc.nodeId : null);
      steps.slice(0, deepest).forEach(step => void fetchLevel(step));
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The URL holds the deepest open branch and selected item, so refresh and links return here.
  useEffect(() => {
    if (restoring) return;
    const last = path.at(-1);
    onLocation(last ? { missionId: path[0].missionId, ...last.options, nodeId: leafId ?? undefined } : null);
  }, [path, leafId, restoring]); // eslint-disable-line react-hooks/exhaustive-deps

  const layout = useMemo(() => {
    const entities: MapEntity[] = roots.map(m => ({ id: m.id, kind: 'mission', title: m.title, progress: m.progress, complete: false }));
    const mapLevels: MapLevel[] = path.map((step, i) => {
      const branch = levels[step.id]?.branch;
      const children: MapEntity[] = (branch?.rows ?? []).map(row => ({ id: row.id, title: row.title, progress: row.progressPercentage, complete: row.isComplete,
        kind: row.isSubMission ? 'submission' : isContainer(row) ? 'page' : 'item' }));
      const next = path[i + 1];
      if (next && !children.some(c => c.id === next.id)) children.push({ id: next.id, title: next.title, kind: next.options.parentNodeId ? 'page' : 'submission', progress: null, complete: false });
      if (branch?.hasMore) children.push({ id: `more:${step.id}`, title: 'More items', kind: 'more', progress: null, complete: false });
      return { parentId: step.id, children };
    });
    return layoutMissionMap(entities, mapLevels);
  }, [roots, path, levels]);

  const last = path.at(-1);
  const camera = aimed ?? mapCamera(layout, leafId ?? last?.id ?? null, size, !leafId && !!last);
  const focusId = leafId ?? last?.id ?? null;
  const focusNode = layout.nodes.find(n => n.id === focusId);
  // Navigation re-aims the camera; manual pan/zoom holds until the next navigation.
  useEffect(() => { setFree(false); }, [focusId]);
  useEffect(() => {
    if (!free) setCamera(mapCamera(layout, focusId, size, !leafId && !!last));
  }, [focusId, focusNode?.x, focusNode?.y, size.w, size.h, free, layout.nodes.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    observer.observe(el);
    const wheel = (e: WheelEvent) => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.11 : 0.9, e.clientX, e.clientY); };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => { observer.disconnect(); el.removeEventListener('wheel', wheel); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- zoomAt uses only refs and state setters

  function zoomAt(factor: number, clientX?: number, clientY?: number) {
    const rect = frame.current!.getBoundingClientRect();
    const mx = (clientX ?? rect.left + rect.width / 2) - rect.left, my = (clientY ?? rect.top + rect.height / 2) - rect.top;
    setFree(true);
    setCamera(prev => {
      const c = prev ?? camera;
      const z = Math.max(0.37, Math.min(2.1, c.z * factor));
      const wx = (mx - rect.width / 2) / c.z + c.x, wy = (my - rect.height / 2) / c.z + c.y;
      return { x: wx - (mx - rect.width / 2) / z, y: wy - (my - rect.height / 2) / z, z };
    });
  }
  function goTo(steps: Step[], leaf: string | null = null) {
    setPath(steps); setLeafId(leaf); setCardError(null);
  }
  function back() { if (leafId) setLeafId(null); else if (path.length) goTo(path.slice(0, -1)); }

  function choose(node: MapNode) {
    if (node.kind === 'more') { const step = path.find(s => `more:${s.id}` === node.id); if (step) void fetchLevel(step, true); return; }
    if (node.depth === 0) {
      const mission = roots.find(m => m.id === node.id)!;
      if (path[0]?.id === node.id) { goTo(path.length === 1 && !leafId ? [] : [path[0]]); return; }
      const step = missionStep(mission);
      goTo([step]);
      if (!levelsRef.current[step.id]?.branch) void fetchLevel(step);
      return;
    }
    const index = path.findIndex(s => s.id === node.parentId);
    const row = rows.get(node.id);
    if (index < 0 || !row) return;
    const base = path.slice(0, index + 1);
    if (!isContainer(row)) { goTo(base, leafId === row.id && path.length === base.length ? null : row.id); return; }
    if (path[index + 1]?.id === row.id && path.length === index + 2 && !leafId) { goTo(base); return; }
    const step = path[index + 1]?.id === row.id ? path[index + 1] : rowStep(row, path[0].missionId);
    goTo([...base, step]);
    if (!levelsRef.current[step.id]?.branch) void fetchLevel(step);
  }
  function switchSection(section: ChecklistSection) {
    if (!last) return;
    const step = { ...last, options: { ...last.options, section, cursor: 0 } };
    goTo([...path.slice(0, -1), step]);
    void fetchLevel(step);
  }

  const leaf = leafId ? rows.get(leafId) : undefined;
  const leafNode = leafId ? layout.nodes.find(n => n.id === leafId) : undefined;
  const leafLevel = leaf && last ? levels[last.id]?.branch : undefined;
  const mission = path[0] ? roots.find(m => m.id === path[0].id) : undefined;
  async function quickComplete() {
    if (!leaf || !leafLevel || !mission) return;
    const form = new FormData();
    form.set('command', 'state'); form.set('checklist_id', leaf.checklistId); form.set('taskId', mission.id);
    form.set('expectedVersion', String(leafLevel.taskVersion)); form.set('node_id', leaf.id); form.set('state', leaf.completionState === 'Yes' ? 'No' : 'Yes');
    form.set('operationId', crypto.randomUUID()); // idempotency key, as ExecutionForm supplies
    setCardBusy(true); setCardError(null);
    const result = await checklistCommand(form).catch(() => ({ success: false as const, error: 'The change could not be saved. Retry.' }));
    setCardBusy(false);
    if (!result.success) { setCardError(result.error ?? 'The change could not be saved. Retry.'); return; }
    refreshPath();
  }

  const pathIds = new Set(path.map(s => s.id));
  const lastLevel = last ? levels[last.id] : undefined;
  const sectionStep = last && !last.options.parentNodeId ? last : undefined;
  const status = restoring ? 'Opening your saved place…' : !last ? `${roots.length} open ${roots.length === 1 ? 'mission' : 'missions'}`
    : leaf ? `Action item · depth ${path.length}` : lastLevel?.loading && !lastLevel.branch ? 'Loading branch…' : `${lastLevel?.branch?.rows.length ?? 0} items · depth ${path.length}`;
  const { w, h } = size;

  return <div className="mt-4 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
    <div className={cn('min-w-0', !leaf && 'xl:col-span-2')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Roadmap breadcrumb" className="min-w-0">
          <ol className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
            <li><button type="button" onClick={() => goTo([])} className={cn('hover:text-primary rounded px-1.5 py-1.5 font-medium', !last && 'text-primary')}>Full roadmap</button></li>
            {path.map((step, i) => <li key={step.id} className="flex min-w-0 items-center gap-1"><ChevronRightIcon className="size-3.5 shrink-0" aria-hidden="true" />
              <button type="button" onClick={() => goTo(path.slice(0, i + 1))} aria-current={i === path.length - 1 && !leaf ? 'location' : undefined} className={cn('hover:text-primary max-w-48 truncate rounded px-1.5 py-1.5', i === path.length - 1 && !leaf && 'text-primary font-semibold')}>{step.title}</button></li>)}
            {leaf ? <li className="flex min-w-0 items-center gap-1"><ChevronRightIcon className="size-3.5 shrink-0" aria-hidden="true" /><span aria-current="location" className="text-primary max-w-48 truncate px-1.5 font-semibold">{leaf.title}</span></li> : null}
          </ol>
        </nav>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Map controls">
          <Button size="sm" variant="outline" disabled={!last} onClick={back}><ArrowUpLeftIcon aria-hidden="true" />Back</Button>
          <Button size="sm" variant="outline" onClick={() => { goTo([]); setFree(false); }}><HouseIcon aria-hidden="true" />Full map</Button>
          <Button size="icon" variant="outline" className="size-8" aria-label="Zoom in" onClick={() => zoomAt(1.25)}><PlusIcon aria-hidden="true" /></Button>
          <Button size="icon" variant="outline" className="size-8" aria-label="Zoom out" onClick={() => zoomAt(0.8)}><MinusIcon aria-hidden="true" /></Button>
        </div>
      </div>
      {last ? <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {sectionStep ? <div role="group" aria-label="Checklist sections" className="bg-muted flex rounded-full p-1">
          {SECTIONS.map(section => <Button key={section} size="sm" variant={(sectionStep.options.section ?? 'activity') === section ? 'default' : 'ghost'} aria-pressed={(sectionStep.options.section ?? 'activity') === section} onClick={() => switchSection(section)} className="capitalize">{section}</Button>)}
        </div> : <span />}
        {mission ? <span className="flex flex-wrap gap-3 text-xs font-semibold">
          <Link className="text-primary underline-offset-4 hover:underline" href={checklistWorkHref(mission.taskTag, last.options)}>Add or manage items</Link>
          <Link className="text-primary underline-offset-4 hover:underline" href={`/tasks/${encodeURIComponent(mission.taskTag)}`}>Mission details</Link>
        </span> : null}
      </div> : null}
      {lastLevel?.error ? <p role="alert" className="text-danger mt-2 text-sm">{lastLevel.error} <button type="button" className="font-semibold underline" onClick={() => last && fetchLevel(last)}><RotateCcwIcon className="inline size-3.5" aria-hidden="true" /> Retry branch</button></p> : null}

      <section ref={frame} aria-label="Mission map" aria-busy={restoring || !!lastLevel?.loading}
        className={cn(styles.frame, 'mt-3', dragging && styles.dragging)}
        onKeyDown={e => { if (e.key === 'Escape' && (last || leafId)) { e.preventDefault(); back(); } }}
        onPointerDown={e => {
          if ((e.target as HTMLElement).closest('button,a,input,select,textarea') || e.button !== 0) return;
          drag.current = { x: e.clientX, y: e.clientY, cx: camera.x, cy: camera.y };
          setDragging(true); setFree(true); e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={e => { const d = drag.current; if (d) setCamera(prev => { const c = prev ?? camera; return { ...c, x: d.cx - (e.clientX - d.x) / c.z, y: d.cy - (e.clientY - d.y) / c.z }; }); }}
        onPointerUp={() => { drag.current = null; setDragging(false); }} onPointerCancel={() => { drag.current = null; setDragging(false); }}>
        <div className={cn(styles.world, (dragging || free) && styles.free)} style={{ width: layout.width, height: layout.height, transform: `translate3d(${w / 2 - camera.x * camera.z}px,${h / 2 - camera.y * camera.z}px,0) scale(${camera.z})` }}>
          <svg className={styles.paths} width={layout.width} height={layout.height} aria-hidden="true">
            {layout.road ? <path className={styles.road} d={layout.road} /> : null}
            {layout.edges.map(edge => <path key={edge.id} d={edge.d} className={cn(styles.link, path.length > 0 && !pathIds.has(edge.id) && layout.nodes.find(n => n.id === edge.id)?.parentId !== last?.id && styles.muted)} style={{ stroke: `var(--hue-${edge.hue})` }} />)}
          </svg>
          {layout.nodes.map(node => {
            const row = rows.get(node.id);
            const m = node.depth === 0 ? roots.find(r => r.id === node.id) : undefined;
            const opened = pathIds.has(node.id);
            const dim = path.length > 0 && !opened && node.parentId !== last?.id;
            const overdue = !!m?.dueDate && m.dueDate < today;
            const sub = node.kind === 'more' ? `Load ${BATCH} more`
              : m ? `${pct(m.progress)} · ${missionDueLabel(m.dueDate, today)}`
              : node.kind === 'item' ? (row?.applicable === false ? 'Not applicable' : node.complete ? 'Complete' : 'Open to work')
              : `${pct(node.progress)} · ${row?.childCount ?? 0} items${opened ? ' · open' : ''}`;
            const Icon = node.kind === 'mission' ? OrbitIcon : node.kind === 'submission' ? SparklesIcon : node.kind === 'page' ? LayersIcon : node.kind === 'more' ? PlusIcon : node.complete ? CheckIcon : CircleIcon;
            const kindLabel = { mission: 'Mission', submission: 'Sub-mission', page: 'Page', item: 'Item', more: 'More items' }[node.kind];
            return <button key={node.id} type="button" data-map-node={node.id} tabIndex={dim ? -1 : 0}
              className={cn(styles.node, node.depth > 1 && styles.small, dim && styles.dim, node.id === focusId && styles.current)}
              style={{ left: node.x, top: node.y, ['--node' as string]: `var(--hue-${node.hue})` }}
              aria-label={`${kindLabel}: ${node.title}. ${sub}.`}
              aria-expanded={node.kind === 'item' || node.kind === 'more' ? undefined : opened}
              aria-pressed={node.kind === 'item' ? node.id === leafId : undefined}
              onClick={e => { e.stopPropagation(); choose(node); }}>
              <span className={styles.coin}><Icon className={node.depth > 1 ? 'size-6' : 'size-7'} aria-hidden="true" />
                {node.complete && node.kind !== 'item' ? <span className={styles.check}><CheckIcon className="size-3.5" strokeWidth={3} aria-hidden="true" /></span> : null}
                {overdue ? <span className={styles.flag}>Overdue</span> : m?.dueDate === today ? <span className={styles.flag}>Today</span> : row?.isSubMission && row.priority > 0 ? <span className={styles.flag}>Priority {row.priority}</span> : null}
              </span>
              <span className={styles.name}>{node.title}</span>
              <span className={styles.sub}>{sub}</span>
            </button>;
          })}
          {leaf && leafNode ? <div className={styles.card} style={{ left: leafNode.side < 0 ? leafNode.x - 126 - 250 : leafNode.x + 126, top: leafNode.y }}>
            <div className="flex items-start justify-between gap-2"><p className="text-primary text-[10px] font-extrabold tracking-widest uppercase">{leaf.section ?? 'activity'} item</p>
              <button type="button" aria-label="Close item" onClick={() => setLeafId(null)} className="text-muted-foreground -mt-1 -mr-1 rounded p-1 hover:text-foreground"><XIcon className="size-4" aria-hidden="true" /></button></div>
            <h3 className="text-foreground mt-2 text-base leading-snug font-semibold break-words">{leaf.title}</h3>
            <p className="text-muted-foreground mt-1 text-xs">{leaf.applicable === false ? 'Not applicable' : leaf.isComplete ? 'Complete' : 'Not done yet'}{leaf.linkedTaskId ? ' · follows a linked mission' : ''}</p>
            {cardError ? <p role="alert" className="text-danger mt-2 text-xs">{cardError}</p> : null}
            {!leaf.linkedTaskId && leaf.applicable !== false ? <Button size="sm" className="mt-3 w-full" variant={leaf.completionState === 'Yes' ? 'outline' : 'default'} disabled={cardBusy} onClick={quickComplete}>
              {cardBusy ? 'Saving…' : leaf.completionState === 'Yes' ? 'Mark not done' : <><CheckIcon aria-hidden="true" />Complete step</>}</Button> : null}
            <Button size="sm" variant="ghost" className="mt-1 w-full" onClick={() => panelHeading.current?.focus()}>Timer and details</Button>
          </div> : null}
        </div>
        <p className={cn(styles.float, styles.left)} aria-live="polite">{status}</p>
        <p className={cn(styles.float, styles.right)}>{free ? 'Manual' : last ? `Depth ${path.length}` : 'Overview'} · {Math.round(camera.z * 100)}%</p>
        <p className={cn(styles.float, styles.bottom)}>Drag to pan · Scroll or ＋/－ to zoom · Select a node to open it · Esc goes back</p>
      </section>
    </div>
    {leaf && mission && leafLevel ? <aside aria-labelledby="map-work-title" className="border-border bg-card h-fit min-w-0 rounded-2xl border p-5 xl:sticky xl:top-6">
      <div className="flex items-start justify-between gap-3"><h3 ref={panelHeading} id="map-work-title" tabIndex={-1} className="text-foreground min-w-0 text-lg font-semibold break-words outline-none">{leaf.title}</h3>
        <Button variant="ghost" size="icon" className="size-8" aria-label="Close focused work" onClick={() => setLeafId(null)}><XIcon aria-hidden="true" /></Button></div>
      <RoadmapItemWork key={`${leaf.id}:${leafLevel.taskVersion}`} mission={{ ...mission, lifecycleVersion: leafLevel.taskVersion }} node={leaf} onOpen={() => undefined} onCommitted={refreshPath} />
    </aside> : null}
  </div>;
}
