'use client';

import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { MissionActionsMenu } from '@/modules/tasks/components/mission-actions-menu';
import { ArrowUpLeftIcon, CheckIcon, ChevronRightIcon, HouseIcon, LocateFixedIcon, MinusIcon, PlusIcon, RotateCcwIcon, XIcon } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/utils';
import { MISSION_RELATIONSHIP_LABELS, MISSION_RELATIONSHIPS } from '@/shared/tracker/enums';
import { canTimeMission, missionDueLabel, type RoadmapMission, type SubMissionAnchor } from '@/modules/tasks/client';
import { checklistWorkHref, type ChecklistBranch, type ChecklistBranchOptions, type ChecklistBranchRow, type ChecklistSection } from '@/modules/checklists/client';
import { checklistCommand } from '@/modules/checklists/actions';
import {
  branchForRow, graphCamera, hashtagMatches, labelEdges, layoutMissionGraph, LABEL_WIDTH, wheelZoomFactor,
  type GraphCamera, type HashtagRecords, type GraphEntity, type GraphLevel, type GraphLink, type GraphNode, type RoadmapLocation,
} from '@/modules/workspace-views/client';
import { loadGraphHashtag, loadRoadmapBranch, loadSubMissionAnchors } from '@/modules/workspace-views/roadmap-actions';
import { TimerButton } from '@/modules/time-tracking/components/timer-button';
import type { Label } from '@/modules/labels/client';
import { LabelChips } from '@/modules/labels/components/label-chips';
import { GraphHashtagPicker } from './graph-hashtag-picker';
import styles from './mission-graph.module.css';

const RoadmapItemWork = dynamic(() => import('./roadmap-item-work').then(m => m.RoadmapItemWork), {
  loading: () => <p role="status" className="text-muted-foreground py-4 text-sm">Preparing work controls…</p>,
});
const SECTIONS: ChecklistSection[] = ['setup', 'activity', 'closure'];
const BATCH = 20;

/** A mission on the graph; `relationship` (migration 108) says how the viewer is attached to it, if at all. */
type GraphMission = RoadmapMission;
/** One opened node on the path: the mission, then each opened row with rows under it. */
interface Step { id: string; title: string; missionId: string; options: ChecklistBranchOptions }
interface Level { branch?: ChecklistBranch; error?: string; loading?: boolean }

function missionStep(m: Pick<RoadmapMission, 'id' | 'title'>, options: ChecklistBranchOptions = { section: 'activity' }): Step {
  return { id: m.id, title: m.title, missionId: m.id, options };
}
function rowStep(row: Pick<ChecklistBranchRow, 'id' | 'title' | 'checklistId' | 'section'>, missionId: string): Step {
  return { id: row.id, title: row.title, missionId, options: branchForRow(row) };
}
const isContainer = (row: ChecklistBranchRow) => row.childCount > 0;
const pct = (value: number | null) => value === null ? 'Not started' : `${Math.round(value)}%`;
const HINT_MS = 1800;
const HASHTAG_REASON = { label: 'Carries', note: 'Has a note with', linked: 'Follows a sub-mission with' } as const;
const RELATION_TEXT = { Subtask: ['Sub-mission of', 'Has sub-mission'], Dependency: ['Depends on', 'Needed by'], Blocks: ['Blocked by', 'Blocks'], Related: ['Related to', 'Related to'] } as const;

/** The caption under the map and the one-time "Use Ctrl + scroll" hint, kept out of the map's render. */
const MapHint = forwardRef<{ show: () => void }>(function MapHint(_, ref) {
  const [mod, setMod] = useState('Ctrl');
  const [hint, setHint] = useState(false);
  const shown = useRef(false);
  useEffect(() => { if (/Mac|iPhone|iPad/.test(navigator.userAgent)) setMod('⌘'); }, []);
  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(false), HINT_MS);
    return () => clearTimeout(timer);
  }, [hint]);
  useImperativeHandle(ref, () => ({ show: () => { if (!shown.current) { shown.current = true; setHint(true); } } }), []);
  return <>
    <p className={cn(styles.float, styles.bottom)}>Drag to pan · {mod}{' + '}scroll to zoom</p>
    {/* Stays mounted so the status is announced when its text appears. */}
    <p className={cn(styles.hint, !hint && styles.idle)} role="status">{hint ? `Use ${mod} + scroll to zoom` : ''}</p>
  </>;
});

/** What the lines and rings mean, in words and line styles (no colour needed). */
const TONE_KEY = [['mission', 'Mission'], ['submission', 'Sub-mission'], ['quest', 'Quest'], ['objective', 'Objective']] as const;
function GraphLegend({ rings, hashtag, origin }: { rings: boolean; hashtag: string | null; origin: boolean }) {
  return <ul aria-label="Map key" className="text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
    {TONE_KEY.map(([tone, label]) => <li key={tone}><span className={styles.tone} style={{ ['--a' as string]: `var(--map-${tone}-a)`, ['--b' as string]: `var(--map-${tone}-b)` } as CSSProperties} aria-hidden="true" /> {label}</li>)}
    <li><span className={styles.swatch} aria-hidden="true" /> Sub-mission link</li>
    {origin ? <li><span className={cn(styles.swatch, styles.originSwatch)} aria-hidden="true" /> Sub-mission from this Quest or row</li> : null}
    <li><span className={cn(styles.swatch, styles.dashed)} aria-hidden="true" /> Dependency or blocks</li>
    <li><span className={cn(styles.swatch, styles.dotted)} aria-hidden="true" /> Related</li>
    {hashtag ? <li><span className={cn(styles.swatch, styles.labelSwatch)} aria-hidden="true" /> Shares #{hashtag} (not a link between records)</li> : null}
    <li>Larger star: higher priority · filled: progress</li>
    {rings ? MISSION_RELATIONSHIPS.map(rel => <li key={rel}><span className={cn(styles.key, styles[rel])} aria-hidden="true" /> {MISSION_RELATIONSHIP_LABELS[rel]}</li>) : null}
  </ul>;
}

export function MissionGraph({ missions, links = [], labels, names, today, initialLocation, onLocation }: {
  missions: GraphMission[];
  /** Member names by id: a Quest star names its owner (migration 122). */
  names?: Readonly<Record<string, string>> | null;
  /** Labels per mission id (migration 112): names under each mission star, chips beside the open mission. */
  labels?: Readonly<Record<string, readonly Label[]>> | null;
  /** Stored relations between missions in the loaded batches (Subtask, Dependency, Blocks, Related). */
  links?: GraphLink[];
  today: string;
  initialLocation: RoadmapLocation | null;
  onLocation: (location: RoadmapLocation | null) => void;
}) {
  const [path, setPath] = useState<Step[]>([]);
  const [leafId, setLeafId] = useState<string | null>(null);
  const [levels, setLevels] = useState<Record<string, Level>>({});
  const [found, setFound] = useState<Record<string, GraphMission>>({});
  // Null until the first aim; render then derives it so server HTML already shows the sky.
  const [aimed, setCamera] = useState<GraphCamera | null>(null);
  const [free, setFree] = useState(false);
  const [recentre, setRecentre] = useState(0);
  const [size, setSize] = useState({ w: 800, h: 520 });
  const [dragging, setDragging] = useState(false);
  const [restoring, setRestoring] = useState(!!initialLocation);
  const [cardBusy, setCardBusy] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  // Phones: the first tap focuses a star (and shows its name), the second opens it.
  const [armed, setArmed] = useState<string | null>(null);
  // Hashtag highlight: the chosen label, what labelled(slug) said (null while reading) and the faint label lines.
  const [hashtag, setHashtag] = useState<Label | null>(null);
  const [hashtagRecords, setHashtagRecords] = useState<HashtagRecords | null>(null);
  const [hashtagError, setHashtagError] = useState<string | null>(null);
  // Missions sharing the picked label are linked by default (user decision, 6 November 2026); the box turns it off.
  const [labelLinks, setLabelLinks] = useState(true);
  // Where each opened mission's sub-missions hang in its checklist (read once per mission when it opens).
  const [anchors, setAnchors] = useState<Record<string, Record<string, SubMissionAnchor>>>({});
  const anchorsAsked = useRef(new Set<string>());
  const gradientPrefix = useId().replace(/:/g, '');
  const hashtagSeq = useRef(0);
  const pointer = useRef<string | null>(null);
  const frame = useRef<HTMLElement>(null);
  const panelHeading = useRef<HTMLHeadingElement>(null);
  const levelsRef = useRef(levels);
  const sequence = useRef<Record<string, number>>({});
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const hintRef = useRef<{ show: () => void }>(null);
  const aimedAt = useRef<{ id: string | null; recentre: number; pos: { x: number; y: number } | null } | null>(null);
  levelsRef.current = levels;

  // Missions in the loaded batches, plus a deep-linked mission from a later batch.
  const roots = useMemo(() => {
    const list: GraphMission[] = missions.map(m => ({ ...m, ...found[m.id], relationship: m.relationship ?? found[m.id]?.relationship }));
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
  /** Reads, once per mission, which Quest or row each of its sub-missions hangs from; a failure keeps the mission line. */
  function fetchAnchors(missionId: string) {
    if (anchorsAsked.current.has(missionId)) return;
    anchorsAsked.current.add(missionId);
    void loadSubMissionAnchors(missionId).then(result => {
      if (result.success && result.data) setAnchors(p => ({ ...p, [missionId]: result.data! }));
      else anchorsAsked.current.delete(missionId);
    }).catch(() => anchorsAsked.current.delete(missionId));
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
      fetchAnchors(mission.id);
      const ancestors = branch.ancestors.map(a => rowStep({ id: a.nodeId, title: a.title, checklistId: a.checklistId, section: loc.section ?? 'activity' }, mission.id));
      const steps = [missionStep(mission), ...ancestors];
      const deepest = steps.length - 1;
      steps[deepest] = { ...steps[deepest], options: { ...steps[deepest].options, section: loc.section ?? 'activity', cursor: loc.cursor ?? 0 } };
      setLevels(p => ({ ...p, [steps[deepest].id]: { branch } }));
      setPath(steps);
      setLeafId(loc.nodeId && branch.rows.some(r => r.id === loc.nodeId) ? loc.nodeId : null);
      steps.slice(0, deepest).forEach(step => void fetchLevel(step));
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The URL holds the deepest open branch and selected row, so refresh and links return here.
  useEffect(() => {
    if (restoring) return;
    const last = path.at(-1);
    onLocation(last ? { missionId: path[0].missionId, ...last.options, nodeId: leafId ?? undefined } : null);
  }, [path, leafId, restoring]); // eslint-disable-line react-hooks/exhaustive-deps

  const layout = useMemo(() => {
    const entities: GraphEntity[] = roots.map(m => ({ id: m.id, kind: 'mission', title: m.title, progress: m.progress, complete: false, priority: m.priority, relationship: m.relationship ?? null }));
    const graphLevels: GraphLevel[] = path.map((step, i) => {
      const branch = levels[step.id]?.branch;
      const children: GraphEntity[] = (branch?.rows ?? []).map(row => ({ id: row.id, title: row.title, progress: row.progressPercentage, complete: row.isComplete,
        kind: isContainer(row) ? 'quest' : 'objective', linked: !!row.linkedTaskId }));
      const next = path[i + 1];
      if (next && !children.some(c => c.id === next.id)) children.push({ id: next.id, title: next.title, kind: 'quest', progress: null, complete: false });
      if (branch?.hasMore) children.push({ id: `more:${step.id}`, title: 'More objectives', kind: 'more', progress: null, complete: false });
      return { parentId: step.id, children };
    });
    const opened = path[0] ? anchors[path[0].id] : undefined;
    const layout = layoutMissionGraph(entities, links, { levels: graphLevels,
      anchors: opened ? Object.fromEntries(Object.entries(opened).map(([child, anchor]) => [child, anchor.path])) : undefined });
    return { ...layout, byId: new Map(layout.nodes.map(n => [n.id, n])) };
  }, [roots, path, levels, links, anchors]);
  // Sub-missions drawn from a Quest or row of the opened mission: they stay clear while the rest fades.
  const originOf = useMemo(() => new Map(layout.edges.filter(e => e.kind === 'origin').map(e => [e.to, e.from])), [layout]);
  // Nodes carrying the chosen hashtag: loaded missions' labels at once, then labelled(slug) for notes (missions, Quests, objectives) and linked rows.
  const matches = useMemo(() => {
    if (!hashtag) return null;
    const missionsById = new Map(roots.map(m => [m.id, m]));
    return hashtagMatches(layout.nodes.map(n => {
      const m = n.depth === 0 ? missionsById.get(n.id) : undefined;
      return m ? { id: n.id, taskTag: m.taskTag, labelIds: (labels?.[m.id] ?? []).map(l => l.id) } : { id: n.id, linkedTaskId: rows.get(n.id)?.linkedTaskId ?? null };
    }), hashtag.id, hashtagRecords);
  }, [hashtag, hashtagRecords, layout, roots, rows, labels]);
  const hashtagLines = useMemo(() => matches && labelLinks ? labelEdges(layout.nodes, matches) : [], [matches, labelLinks, layout]);
  async function chooseHashtag(label: Label) {
    const seq = ++hashtagSeq.current;
    setHashtag(label); setHashtagRecords(null); setHashtagError(null);
    const result = await loadGraphHashtag(label.slug).catch(() => ({ success: false as const, error: undefined, data: undefined }));
    if (seq !== hashtagSeq.current) return;
    if (result.success && result.data) setHashtagRecords(result.data);
    else setHashtagError(result.error ?? 'This hashtag could not be read. Retry.');
  }
  function clearHashtag() { hashtagSeq.current++; setHashtag(null); setHashtagRecords(null); setHashtagError(null); setLabelLinks(false); }

  // Keyboard order: missions in the batch's due order, then each opened level's rows.
  const ordered = useMemo(() => {
    const index = new Map(roots.map((m, i) => [m.id, i]));
    return [...layout.nodes].sort((a, b) => a.depth - b.depth || (a.depth === 0 ? index.get(a.id)! - index.get(b.id)! : 0));
  }, [layout, roots]);
  // Each mission's stored relations, said in words for its label.
  const relationText = useMemo(() => {
    const text = new Map<string, string[]>();
    const add = (id: string, words: string) => text.set(id, [...(text.get(id) ?? []), words]);
    for (const edge of layout.edges) {
      if (!edge.relation) continue;
      const from = layout.byId.get(edge.from)!, to = layout.byId.get(edge.to)!;
      const [toSide, fromSide] = RELATION_TEXT[edge.relation];
      // Subtask: `to` is the sub-mission of `from`. Dependency: `to` depends on `from`. Blocks: `from` blocks `to`.
      add(edge.to, `${toSide} ${from.title}`); add(edge.from, `${fromSide} ${to.title}`);
    }
    return text;
  }, [layout]);

  const last = path.at(-1);
  const focusId = leafId ?? last?.id ?? null;
  const expanded = !leafId && !!last;
  const camera = aimed ?? graphCamera(layout, focusId, size, expanded);
  const focusNode = focusId ? layout.byId.get(focusId) : undefined;
  // The camera re-aims only when the focus or Re-centre changes, never on a resize. If the focused node
  // itself shifts (its level loads around it), the view slides with it and any manual pan is kept.
  useEffect(() => {
    const prev = aimedAt.current;
    const pos = focusNode ? { x: focusNode.x, y: focusNode.y } : null;
    aimedAt.current = { id: focusId, recentre, pos };
    if (prev && prev.id === focusId && prev.recentre === recentre && !!prev.pos === !!pos) {
      if (pos && prev.pos && (pos.x !== prev.pos.x || pos.y !== prev.pos.y)) {
        const dx = pos.x - prev.pos.x, dy = pos.y - prev.pos.y;
        setCamera(c => c && { ...c, x: c.x + dx, y: c.y + dy });
      }
      return;
    }
    const el = frame.current;
    setFree(false);
    setCamera(graphCamera(layout, focusId, el ? { w: el.clientWidth, h: el.clientHeight } : size, expanded));
  }, [focusId, focusNode?.x, focusNode?.y, recentre]); // eslint-disable-line react-hooks/exhaustive-deps
  // An opened level arrives after the camera aimed at its parent: aim again once, to frame the rows.
  const childCount = last ? layout.nodes.filter(n => n.parentId === last.id).length : 0;
  useEffect(() => {
    if (!expanded || free || !childCount) return;
    const el = frame.current;
    setCamera(graphCamera(layout, focusId, el ? { w: el.clientWidth, h: el.clientHeight } : size, true));
  }, [childCount]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    observer.observe(el);
    // A plain wheel scrolls the page; Ctrl/Cmd + wheel and trackpad pinch (sent as ctrl + wheel) zoom.
    const wheel = (e: WheelEvent) => {
      const factor = wheelZoomFactor(e);
      if (factor === null) { hintRef.current?.show(); return; }
      e.preventDefault();
      zoomAt(factor, e.clientX, e.clientY);
    };
    // One finger scrolls the page (touch-action in the CSS); two fingers pinch the map. The
    // non-passive move listener exists only while two fingers are down, so page scrolling stays smooth.
    let pinch = 0;
    const spread = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const touchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !e.cancelable) return;
      e.preventDefault();
      const next = spread(e.touches);
      zoomAt(next / pinch, (e.touches[0].clientX + e.touches[1].clientX) / 2, (e.touches[0].clientY + e.touches[1].clientY) / 2);
      pinch = next;
    };
    const touchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      pinch = spread(e.touches);
      el.addEventListener('touchmove', touchMove, { passive: false });
    };
    const touchEnd = (e: TouchEvent) => { if (e.touches.length < 2) el.removeEventListener('touchmove', touchMove); };
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('touchstart', touchStart, { passive: true });
    el.addEventListener('touchend', touchEnd);
    el.addEventListener('touchcancel', touchEnd);
    return () => {
      observer.disconnect();
      el.removeEventListener('wheel', wheel);
      el.removeEventListener('touchstart', touchStart); el.removeEventListener('touchmove', touchMove);
      el.removeEventListener('touchend', touchEnd); el.removeEventListener('touchcancel', touchEnd);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- zoomAt uses only refs and state setters

  function zoomAt(factor: number, clientX?: number, clientY?: number) {
    const rect = frame.current!.getBoundingClientRect();
    const mx = (clientX ?? rect.left + rect.width / 2) - rect.left, my = (clientY ?? rect.top + rect.height / 2) - rect.top;
    setFree(true);
    setCamera(prev => {
      const c = prev ?? camera;
      const z = Math.max(0.3, Math.min(2.1, c.z * factor));
      const wx = (mx - rect.width / 2) / c.z + c.x, wy = (my - rect.height / 2) / c.z + c.y;
      return { x: wx - (mx - rect.width / 2) / z, y: wy - (my - rect.height / 2) / z, z };
    });
  }
  function goTo(steps: Step[], leaf: string | null = null) {
    setPath(steps); setLeafId(leaf); setCardError(null); setArmed(null);
  }
  function back() { if (leafId) setLeafId(null); else if (path.length) goTo(path.slice(0, -1)); }

  function choose(node: GraphNode) {
    if (node.kind === 'more') { const step = path.find(s => `more:${s.id}` === node.id); if (step) void fetchLevel(step, true); return; }
    if (node.depth === 0) {
      const mission = roots.find(m => m.id === node.id)!;
      if (path[0]?.id === node.id) { goTo(path.length === 1 && !leafId ? [] : [path[0]]); return; }
      const step = missionStep(mission);
      goTo([step]);
      if (!levelsRef.current[step.id]?.branch) void fetchLevel(step);
      fetchAnchors(mission.id);
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
  const leafNode = leafId ? layout.byId.get(leafId) : undefined;
  const leafLevel = leaf && last ? levels[last.id]?.branch : undefined;
  const mission = path[0] ? roots.find(m => m.id === path[0].id) : undefined;
  async function quickComplete() {
    if (!leaf || !leafLevel || !mission) return;
    const form = new FormData();
    form.set('command', 'state'); form.set('checklist_id', leaf.checklistId); form.set('taskId', mission.id);
    form.set('expectedVersion', String(leafLevel.taskVersion)); form.set('node_id', leaf.id); form.set('state', leaf.completionState === 'Yes' ? 'No' /* cleared: the stored not-done value */ : 'Yes');
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
  // An open Quest star carries its own timer (migration 123); the mission timer hides once a mission has Quests.
  const openRow = last && path.length > 1 ? rows.get(last.id) : undefined;
  const openQuest = openRow?.ownedChecklistId ? openRow : undefined;
  const status = restoring ? 'Opening your saved place…' : !last ? `${roots.length} open ${roots.length === 1 ? 'mission' : 'missions'}`
    : leaf ? `Objective · depth ${path.length}` : lastLevel?.loading && !lastLevel.branch ? 'Loading branch…' : `${lastLevel?.branch?.rows.length ?? 0} rows · depth ${path.length}`;
  const { w, h } = size;
  // Where a node's settle animation starts: its parent, or the centre of the sky for missions.
  const sky = useMemo(() => {
    const top = layout.nodes.filter(n => n.depth === 0);
    return top.length ? { x: top.reduce((s, n) => s + n.x, 0) / top.length, y: top.reduce((s, n) => s + n.y, 0) / top.length } : { x: 0, y: 0 };
  }, [layout]);
  const shown = (id: string) => !path.length || pathIds.has(id) || layout.byId.get(id)?.parentId === last?.id;
  const visible = (id: string) => shown(id) || (originOf.has(id) && shown(originOf.get(id)!));

  return <div className="mt-4 grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
    <div className={cn('min-w-0', !leaf && 'xl:col-span-2')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Roadmap breadcrumb" className="min-w-0">
          <ol className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
            <li><button type="button" onClick={() => goTo([])} className={cn('hover:text-primary rounded px-1.5 py-1.5 font-medium', !last && 'text-primary')}>Whole sky</button></li>
            {path.map((step, i) => <li key={step.id} className="flex min-w-0 items-center gap-1"><ChevronRightIcon className="size-3.5 shrink-0" aria-hidden="true" />
              <button type="button" onClick={() => goTo(path.slice(0, i + 1))} aria-current={i === path.length - 1 && !leaf ? 'location' : undefined} className={cn('hover:text-primary max-w-48 truncate rounded px-1.5 py-1.5', i === path.length - 1 && !leaf && 'text-primary font-semibold')}>{step.title}</button></li>)}
            {leaf ? <li className="flex min-w-0 items-center gap-1"><ChevronRightIcon className="size-3.5 shrink-0" aria-hidden="true" /><span aria-current="location" className="text-primary max-w-48 truncate px-1.5 font-semibold">{leaf.title}</span></li> : null}
          </ol>
        </nav>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Map controls">
          <Button size="sm" variant="outline" disabled={!last} onClick={back}><ArrowUpLeftIcon aria-hidden="true" />Back</Button>
          <Button size="sm" variant="outline" onClick={() => { goTo([]); setRecentre(n => n + 1); }}><HouseIcon aria-hidden="true" />Whole sky</Button>
          <Button size="sm" variant="outline" onClick={() => setRecentre(n => n + 1)}><LocateFixedIcon aria-hidden="true" />Re-centre</Button>
          <Button size="icon" variant="outline" className="size-8" aria-label="Zoom in" onClick={() => zoomAt(1.25)}><PlusIcon aria-hidden="true" /></Button>
          <Button size="icon" variant="outline" className="size-8" aria-label="Zoom out" onClick={() => zoomAt(0.8)}><MinusIcon aria-hidden="true" /></Button>
        </div>
      </div>
      <div className="mt-2">
        <GraphHashtagPicker chosen={hashtag} count={matches?.size ?? 0} loading={!!hashtag && !hashtagRecords && !hashtagError} error={hashtagError}
          labelLinks={labelLinks} onChoose={label => void chooseHashtag(label)} onClear={clearHashtag} onLabelLinks={setLabelLinks} />
      </div>
      {last ? <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {sectionStep ? <div role="group" aria-label="Checklist sections" className="bg-muted flex rounded-full p-1">
          {SECTIONS.map(section => <Button key={section} size="sm" variant={(sectionStep.options.section ?? 'activity') === section ? 'default' : 'ghost'} aria-pressed={(sectionStep.options.section ?? 'activity') === section} onClick={() => switchSection(section)} className="capitalize">{section}</Button>)}
        </div> : <span />}
        {mission ? <span className="flex flex-wrap items-center gap-3 text-xs font-semibold">
          {canTimeMission(mission) ? <TimerButton taskId={mission.id} taskLabel={mission.taskTag} /> : null}
          {canTimeMission(mission) && openQuest ? <TimerButton taskId={mission.id} taskLabel={mission.taskTag} nodeId={openQuest.id} questTitle={openQuest.title} /> : null}
          <Link className="link" href={checklistWorkHref(mission.taskTag, last.options)}>Add or manage objectives</Link>
          <Link className="link" href={`/tasks/${encodeURIComponent(mission.taskTag)}`}>Mission details</Link>
          <MissionActionsMenu taskId={mission.id} taskTag={mission.taskTag} />
          <LabelChips labels={labels?.[mission.id]} max={4} />
        </span> : null}
      </div> : null}
      {lastLevel?.error ? <p role="alert" className="text-danger mt-2 text-sm">{lastLevel.error} <button type="button" className="link font-semibold" onClick={() => last && fetchLevel(last)}><RotateCcwIcon className="inline size-3.5" aria-hidden="true" /> Retry branch</button></p> : null}

      <section ref={frame} aria-label="Mission constellation" aria-busy={restoring || !!lastLevel?.loading}
        className={cn(styles.frame, 'mt-3', dragging && styles.dragging)}
        onKeyDown={e => { if (e.key === 'Escape' && (last || leafId)) { e.preventDefault(); back(); } }}
        onPointerDown={e => {
          // Mouse and pen drag the map; a finger scrolls the page instead.
          if (e.pointerType === 'touch' || (e.target as HTMLElement).closest('button,a,input,select,textarea') || e.button !== 0) return;
          drag.current = { x: e.clientX, y: e.clientY, cx: camera.x, cy: camera.y };
          setDragging(true); setFree(true); e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={e => { const d = drag.current; if (d) setCamera(prev => { const c = prev ?? camera; return { ...c, x: d.cx - (e.clientX - d.x) / c.z, y: d.cy - (e.clientY - d.y) / c.z }; }); }}
        onPointerUp={() => { drag.current = null; setDragging(false); }} onPointerCancel={() => { drag.current = null; setDragging(false); }}>
        <div className={cn(styles.world, (dragging || free) && styles.free)} style={{ width: layout.width, height: layout.height, transform: `translate3d(${w / 2 - camera.x * camera.z}px,${h / 2 - camera.y * camera.z}px,0) scale(${camera.z})` }}>
          <svg className={styles.lines} width={layout.width} height={layout.height} aria-hidden="true">
            {/* Each line fades from its source star's colour to its target's, so kinds read along the line too. */}
            <defs>{layout.edges.map((edge, i) => <linearGradient key={edge.id} id={`${gradientPrefix}-g${i}`} gradientUnits="userSpaceOnUse" x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2}>
              <stop offset="0" style={{ stopColor: `var(--map-${edge.fromTone}-a)` }} /><stop offset="1" style={{ stopColor: `var(--map-${edge.toTone}-a)` }} />
            </linearGradient>)}</defs>
            {layout.edges.map((edge, i) => { const d = edge.cx !== undefined ? `M ${edge.x1} ${edge.y1} Q ${edge.cx} ${edge.cy} ${edge.x2} ${edge.y2}` : `M ${edge.x1} ${edge.y1} L ${edge.x2} ${edge.y2}`; return <path key={edge.id} d={d}
              className={cn(styles.edge, edge.kind === 'row' && styles.row, edge.kind === 'origin' && styles.origin, edge.stroke === 'dashed' && styles.dashed, edge.stroke === 'dotted' && styles.dotted,
                path.length > 0 && !(visible(edge.from) && visible(edge.to)) && styles.muted)}
              // The CSS `d` lets a line glide with its stars where supported; the attribute is the fallback.
              style={{ ['--edge' as string]: `url(#${gradientPrefix}-g${i})`, d: `path("${d}")` } as CSSProperties} />; })}
            {layout.edges.filter(e => e.kind === 'origin').map(edge => <circle key={`end:${edge.id}`} className={styles.originEnd} r={4}
              cx={edge.x2 - (edge.x2 - (edge.cx ?? edge.x1)) * (layout.byId.get(edge.to)!.r + 6) / Math.max(Math.hypot(edge.x2 - (edge.cx ?? edge.x1), edge.y2 - (edge.cy ?? edge.y1)), 1)}
              cy={edge.y2 - (edge.y2 - (edge.cy ?? edge.y1)) * (layout.byId.get(edge.to)!.r + 6) / Math.max(Math.hypot(edge.x2 - (edge.cx ?? edge.x1), edge.y2 - (edge.cy ?? edge.y1)), 1)} />)}
            {hashtagLines.map(edge => <path key={edge.id} d={`M ${edge.x1} ${edge.y1} L ${edge.x2} ${edge.y2}`} className={styles.labelEdge} />)}
          </svg>
          {ordered.map(node => {
            const row = rows.get(node.id);
            const m = node.depth === 0 ? roots.find(r => r.id === node.id) : undefined;
            const opened = pathIds.has(node.id);
            const dim = !visible(node.id);
            const match = matches?.get(node.id);
            // With a hashtag chosen, stars that do not carry it fade (still reachable); an open matching mission's rows stay clear.
            const faded = !!matches && !match && !(node.depth > 0 && path[0] && matches.has(path[0].id));
            const overdue = !!m?.dueDate && m.dueDate < today;
            const relationship = m?.relationship ? MISSION_RELATIONSHIP_LABELS[m.relationship] : null;
            const sub = node.kind === 'more' ? `Load ${BATCH} more`
              : m ? [relationship, pct(m.progress), m.isPermanent ? 'Permanent' : missionDueLabel(m.dueDate, today)].filter(Boolean).join(' · ')
              : node.kind === 'objective' ? (row?.applicable === false ? 'Not applicable' : node.complete ? 'Complete' : 'Open to work')
              : [pct(node.progress), `${row?.childCount ?? 0} rows`, row?.ownedChecklistId && row.assigneeId ? names?.[row.assigneeId] ?? null : null, opened ? 'open' : null].filter(Boolean).join(' · ');
            const kindLabel = node.tone === 'submission' ? (node.depth === 0 ? 'Sub-mission' : 'Sub-mission row') : { mission: 'Mission', quest: 'Quest', objective: 'Objective', more: 'More objectives' }[node.kind];
            const from = originOf.get(node.id);
            const hangs = from ? ` Hangs from ${layout.byId.get(from)?.title ?? 'a row'} in the open mission.` : '';
            const relations = relationText.get(node.id);
            const nodeLabels = m ? labels?.[m.id] ?? [] : [];
            const labelText = nodeLabels.length ? [...nodeLabels.slice(0, 2).map(l => `#${l.name}`), ...(nodeLabels.length > 2 ? [`+${nodeLabels.length - 2}`] : [])].join(' ') : null;
            const parent = node.parentId ? layout.byId.get(node.parentId) : undefined;
            const origin = parent ?? sky;
            const progress = node.complete ? 100 : Math.max(0, Math.min(100, node.progress ?? 0));
            return <button key={node.id} type="button" data-map-node={node.id} tabIndex={dim ? -1 : 0}
              className={cn(styles.node, node.depth > 0 && styles.child, styles[node.tone], dim && styles.dim, faded && styles.faded, match && styles.match, node.id === focusId && styles.current, armed === node.id && styles.armed)}
              style={{ left: node.x, top: node.y, ['--node' as string]: `var(--map-${node.tone}-a)`, ['--node-b' as string]: `var(--map-${node.tone}-b)`, ['--r' as string]: node.r, ['--p' as string]: progress,
                ['--w' as string]: `${node.depth === 0 ? LABEL_WIDTH.mission : LABEL_WIDTH.child}px`,
                ['--dx' as string]: `${origin.x - node.x}px`, ['--dy' as string]: `${origin.y - node.y}px` }}
              aria-label={`${kindLabel}: ${node.title}. ${sub}.${m ? ` ${m.priority} priority.` : ''}${relations ? ` ${relations.join('. ')}.` : ''}${nodeLabels.length ? ` Labels: ${nodeLabels.map(l => l.name).join(', ')}.` : ''}${match && hashtag ? ` ${HASHTAG_REASON[match]} #${hashtag.name}.` : ''}${hangs}`}
              aria-expanded={node.kind === 'objective' || node.kind === 'more' ? undefined : opened}
              aria-pressed={node.kind === 'objective' ? node.id === leafId : undefined}
              onPointerDown={e => { pointer.current = e.pointerType; }}
              onBlur={() => { if (armed === node.id) setArmed(null); }}
              onClick={e => {
                e.stopPropagation();
                const touch = pointer.current === 'touch';
                pointer.current = null;
                if (touch && armed !== node.id) { setArmed(node.id); e.currentTarget.focus(); return; }
                setArmed(null); choose(node);
              }}>
              <span className={cn(styles.star, node.complete && styles.done)}>
                {m?.relationship ? <span className={cn(styles.ring, styles[m.relationship])} aria-hidden="true" /> : null}
                {node.complete ? <span className={styles.tick}><CheckIcon className="size-3.5" strokeWidth={3} aria-hidden="true" /></span> : null}
                {node.kind === 'more' ? <PlusIcon className="text-foreground size-3.5" aria-hidden="true" /> : null}
                {overdue ? <span className={styles.flag}>Overdue</span> : m?.dueDate === today ? <span className={styles.flag}>Today</span> : null}
              </span>
              <span className={styles.name}>{node.title}</span>
              <span className={styles.sub}>{armed === node.id ? 'Tap again to open' : sub}</span>
              {labelText ? <span className={styles.labels} aria-hidden="true">{labelText}</span> : null}
            </button>;
          })}
          {leaf && leafNode ? <div className={styles.card} style={{ left: leafNode.x + LABEL_WIDTH.child / 2 + 18, top: leafNode.y }}>
            <div className="flex items-start justify-between gap-2"><p className="text-primary text-[10px] font-extrabold tracking-widest uppercase">{leaf.section ?? 'activity'} objective</p>
              <button type="button" aria-label="Close objective" onClick={() => setLeafId(null)} className="text-muted-foreground -mt-1 -mr-1 rounded p-1 hover:text-foreground"><XIcon className="size-4" aria-hidden="true" /></button></div>
            <h3 className="text-foreground mt-2 text-base leading-snug font-semibold break-words">{leaf.title}</h3>
            <p className="text-muted-foreground mt-1 text-xs">{leaf.applicable === false ? 'Not applicable' : leaf.isComplete ? 'Complete' : 'Not done yet'}{leaf.linkedTaskId ? ' · follows a linked mission' : ''}</p>
            {cardError ? <p role="alert" className="text-danger mt-2 text-xs">{cardError}</p> : null}
            {!leaf.linkedTaskId && leaf.applicable !== false ? <Button size="sm" className="mt-3 w-full" variant={leaf.completionState === 'Yes' ? 'outline' : 'default'} disabled={cardBusy} onClick={quickComplete}>
              {cardBusy ? 'Saving…' : leaf.completionState === 'Yes' ? 'Clear Yes' : <><CheckIcon aria-hidden="true" />Complete step</>}</Button> : null}
            <Button size="sm" variant="ghost" className="mt-1 w-full" onClick={() => panelHeading.current?.focus()}>Timer and details</Button>
          </div> : null}
        </div>
        <p className={cn(styles.float, styles.left)} aria-live="polite">{status}</p>
        <p className={cn(styles.float, styles.right)}>{free ? 'Manual' : last ? `Depth ${path.length}` : 'Overview'} · Zoom {Math.round(camera.z * 100)}%</p>
        <MapHint ref={hintRef} />
      </section>
      <GraphLegend rings={roots.some(m => m.relationship)} hashtag={labelLinks && hashtag ? hashtag.name : null} origin={originOf.size > 0} />
    </div>
    {leaf && mission && leafLevel ? <aside aria-labelledby="map-work-title" className="border-border bg-card h-fit min-w-0 rounded-2xl border p-5 xl:sticky xl:top-[calc(var(--header-offset)+1.5rem)]">
      <div className="flex items-start justify-between gap-3"><h3 ref={panelHeading} id="map-work-title" tabIndex={-1} className="text-foreground min-w-0 text-lg font-semibold break-words outline-none">{leaf.title}</h3>
        <Button variant="ghost" size="icon" className="size-8" aria-label="Close focused work" onClick={() => setLeafId(null)}><XIcon aria-hidden="true" /></Button></div>
      <RoadmapItemWork key={`${leaf.id}:${leafLevel.taskVersion}`} mission={{ ...mission, lifecycleVersion: leafLevel.taskVersion }} node={leaf} onOpen={() => undefined} onCommitted={refreshPath} />
    </aside> : null}
  </div>;
}
