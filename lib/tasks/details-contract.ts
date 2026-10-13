import { isTaskCategory, isTaskPriority } from '@/lib/tracker/enums';
import type { TaskDetailSection, TaskLink } from '@/types/tracker';

export const DETAIL_FIELDS = [
 {key:'description',label:'Description',group:'description'},
 {key:'smart_specific',label:'Specific',group:'smart'},
 {key:'smart_measurable',label:'Measurable',group:'smart'},
 {key:'smart_achievable',label:'Achievable',group:'smart'},
 {key:'smart_relevant',label:'Relevant',group:'smart'},
 {key:'smart_time_bound',label:'Time-Bound',group:'smart'},
 {key:'input_content',label:'Inputs',group:'input'},
 {key:'process_content',label:'Process',group:'process'},
 {key:'output_content',label:'Outputs',group:'output'},
 {key:'reviewer_notes',label:'Reviewer notes',group:'review'},
] as const;
export type DetailKey = typeof DETAIL_FIELDS[number]['key'];
export type IpoRole = 'input' | 'process' | 'output' | 'reference';
export const IPO_ROLES: readonly IpoRole[] = ['input','process','output','reference'];
export interface NativeTemplate {id:string; templateId:string; name:string; version:number; instructions:Partial<Record<DetailKey,string>>; requiresReview:boolean; checklistNodes?:TemplateNode[]; legacyDescription?:string|null; legacyNodes?:{title:string;description:string|null;node_type:string}[];}
export interface TemplateNode {key:string;title:string;section:'setup'|'activity'|'closure';node_type:'Item'|'Group'|'Page';parent_key?:string|null;description?:string|null;sort_order?:number;}
export interface DetailInstance {taskId:string; templateVersionId:string; instructions:Partial<Record<DetailKey,string>>; initializedAt:string; providerState:'not_requested'|'pending'|'failed'|'succeeded';}
export function detailValues(sections: readonly TaskDetailSection[]): Record<DetailKey,string> {
 return Object.fromEntries(DETAIL_FIELDS.map(f=>[f.key,sections.find(s=>s.keyName===f.key)?.content ?? ''])) as Record<DetailKey,string>;
}
export function ipoLinks(links:readonly TaskLink[],role:IpoRole):TaskLink[] {return links.filter(l=>l.ipoRole===role);}
export function sectionsForRole(sections:readonly TaskDetailSection[],role:'input'|'process'|'output'):TaskDetailSection[] {
 return sections.filter(s=>s.keyName.startsWith(role+'_') && Boolean(s.content?.trim()));
}
/** Mirrors existing required entry fields; optional dates/scale and metric status do not enter this predicate. */
export function isValidDetailEntry(task:{taskTag:string;title:string;category:string;priority:string;assigneeIds:readonly string[]}):boolean {
 return Boolean(task.taskTag.trim() && task.taskTag.length<=30 && task.title.trim() && task.title.length<=255 &&
 isTaskCategory(task.category) && isTaskPriority(task.priority) && task.assigneeIds.length);
}
