export const CHECKLIST_SECTIONS = ['setup', 'activity', 'closure'] as const;
export type ChecklistSection = typeof CHECKLIST_SECTIONS[number];
export type CompletionState = 'Yes' | 'No' | 'N/A';
export interface ChecklistProgressNode {
  readonly id: string;
  readonly parentNodeId: string | null;
  readonly section?: ChecklistSection | null;
  readonly nodeType?: string;
  readonly isComplete?: boolean;
  readonly completionState?: CompletionState;
  readonly linkedTaskId?: string | null;
  readonly progressPercentage?: number | null;
  readonly linkedStatus?: string | null;
}
export interface ChecklistNodeProgress {
  readonly id: string;
  readonly progressPercentage: number | null;
  readonly isComplete: boolean;
  readonly applicable: boolean;
}
export interface SectionInitialization { readonly initialized: boolean; readonly intentionalEmpty: boolean }
export interface SectionProgress extends Omit<ChecklistNodeProgress, 'id'> {
  readonly state: 'missing' | 'uninitialized' | 'not_applicable' | 'partial' | 'complete' | 'invalid';
}
export interface ChecklistRollup {
  readonly contract: 'm05-checklist-v1';
  readonly sections: Record<ChecklistSection, SectionProgress>;
  readonly taskProgress: number | null;
  /** Exact PostgreSQL decimal for versioned previews; numerical reads use taskProgress. */
  readonly taskProgressDecimal?: string | null;
  readonly overallProgressPercentage: number | null;
  readonly isComplete: boolean;
  readonly errors: readonly string[];
  readonly nodeProgress: readonly ChecklistNodeProgress[];
}
/** Equal weighting of applicable direct children, with explicit section evidence. */
export function computeChecklistProgress(
  nodes: readonly ChecklistProgressNode[],
  initialization: Partial<Record<ChecklistSection, SectionInitialization>> = {},
): ChecklistRollup {
  const errors: string[] = [];
  const byId = new Map(nodes.map(n => [n.id, n]));
  const children = new Map<string, ChecklistProgressNode[]>();
  const values = new Map<string, ChecklistNodeProgress>();
  const visiting = new Set<string>();
  const unavailable = (id: string): ChecklistNodeProgress => ({id, progressPercentage:null,isComplete:false,applicable:true});
  if (byId.size !== nodes.length) errors.push('duplicate_node');
  for (const n of nodes) {
    if (!n.section) errors.push(`unsectioned:${n.id}`);
    if (n.parentNodeId) {
      const parent = byId.get(n.parentNodeId);
      if (!parent) errors.push(`missing_parent:${n.id}`);
      else if (parent.section !== n.section) errors.push(`cross_section:${n.id}`);
      children.set(n.parentNodeId, [...(children.get(n.parentNodeId) ?? []), n]);
    }
  }
  function average(id: string, list: readonly ChecklistNodeProgress[]): ChecklistNodeProgress {
    const applicable = list.filter(n => n.applicable);
    return {id, applicable: applicable.length>0,
      progressPercentage: applicable.length===0 || applicable.some(n => n.progressPercentage===null) ? null : applicable.reduce((sum,n)=>sum+n.progressPercentage!,0)/applicable.length,
      isComplete: applicable.every(n=>n.isComplete)};
  }
  function resolve(n: ChecklistProgressNode): ChecklistNodeProgress {
    if (visiting.has(n.id)) { errors.push(`cycle:${n.id}`); return unavailable(n.id); }
    const cached=values.get(n.id); if(cached) return cached;
    visiting.add(n.id);
    const nested=children.get(n.id) ?? [];
    const resolved=nested.map(resolve);
    let value: ChecklistNodeProgress;
    if(n.completionState==='N/A' && (n.nodeType==='Task' && !n.linkedTaskId || n.linkedTaskId && !n.linkedStatus)) errors.push(`linked_unavailable:${n.id}`);
    if(n.completionState==='N/A') value={id:n.id,applicable:false,progressPercentage:null,isComplete:true};
    else if(nested.length>0) {
      if(n.linkedTaskId) errors.push(`linked_parent:${n.id}`);
      value=average(n.id,resolved);
    } else if(n.linkedTaskId || n.nodeType==='Task') {
      const p=n.progressPercentage;
      if(!n.linkedTaskId || p===undefined || p===null || !Number.isFinite(p) || p<0 || p>100 || !n.linkedStatus) {
        errors.push(`linked_unavailable:${n.id}`); value=unavailable(n.id);
      } else {
        if(n.linkedStatus==='Done' && p!==100) errors.push(`linked_done_mismatch:${n.id}`);
        value={id:n.id,applicable:true,progressPercentage:p,isComplete:p===100 && n.linkedStatus==='Done'};
      }
    } else if(n.nodeType==='Group' || n.nodeType==='Page') {
      value={id:n.id,applicable:false,progressPercentage:null,isComplete:true};
      if(n.parentNodeId) errors.push(`empty_group:${n.id}`);
    } else value={id:n.id,applicable:true,progressPercentage:n.completionState==='Yes' || (!n.completionState && n.isComplete) ? 100:0,isComplete:n.completionState==='Yes' || (!n.completionState && !!n.isComplete)};
    visiting.delete(n.id); values.set(n.id,value); return value;
  }
  nodes.forEach(resolve);
  const sections={} as Record<ChecklistSection,SectionProgress>;
  for(const role of CHECKLIST_SECTIONS) {
    const roots=nodes.filter(n=>n.section===role && n.parentNodeId===null);
    const init=initialization[role];
    const v=average(role, roots.map(resolve));
    const state=!init ? 'missing' : !init.initialized ? 'uninitialized' : errors.length ? 'invalid' : !v.applicable ? 'not_applicable' : v.isComplete ? 'complete':'partial';
    const emptyAllowed=init?.intentionalEmpty || nodes.some(n=>n.section===role && n.completionState==='N/A');
    if(init?.initialized && !v.applicable && !emptyAllowed) errors.push(`empty_unconfirmed:${role}`);
    sections[role]={...v,state,progressPercentage:state==='missing'||state==='uninitialized'?null:v.progressPercentage,isComplete:!!init?.initialized && v.isComplete && (!!v.applicable || !!emptyAllowed)};
  }
  if(errors.length) for(const role of CHECKLIST_SECTIONS) sections[role]={...sections[role],state:'invalid',progressPercentage:null,isComplete:false};
  const taskProgress=sections.activity.state==='missing' || sections.activity.state==='uninitialized' ? null : sections.activity.progressPercentage;
  return {contract:'m05-checklist-v1',sections,taskProgress,overallProgressPercentage:taskProgress,
    isComplete:errors.length===0 && CHECKLIST_SECTIONS.every(s=>sections[s].isComplete),errors,nodeProgress:[...values.values()]};
}
