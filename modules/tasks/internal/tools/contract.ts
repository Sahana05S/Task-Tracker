import { Exact } from '@/lib/performance/exact';
export type ToolOperation='support'|'duplicate'|'weekly'|'day_count'|'all_team'|'number_suffix'|'carryover'|'bulk_done'|'bulk_reopen'|'section'|'refresh'|'archive';
export interface ToolPolicy {id:string;unevenMaximum:'whole'|'half';copies:'reset_snapshot';phases:'independent_repeats';batch:'atomic';carryover:'remaining_handoff';archive:boolean;historicalImport:false}
/** D09/D12 expressly approved by the user on 13 October 2026. */
export const APPROVED_TOOL_POLICY:ToolPolicy={id:'m09-approved-2026-10-13',unevenMaximum:'whole',copies:'reset_snapshot',phases:'independent_repeats',batch:'atomic',carryover:'remaining_handoff',archive:true,historicalImport:false};
export interface ToolsPreview {id:string;expiresAt:string;command:ToolOperation;policyId:string|null;ready:boolean;reasons:string[];items:{taskTag:string|null;title:string;category:string;assignedDate:string;dueDate:string|null;scale:string|null;scaleMode:string;assignees:string[];reviewers:string[];shares:number[]|null}[];sourceScaleBefore:string|null;sourceScaleAfter:string|null;inheritance:Record<string,string>}
export function supportAmounts(source:string|null,mode:'split-even'|'split-uneven'|'proportional'|'absolute',amount?:string,percentage?:string,maximum:'whole'|'half'='whole') {
 const value=(v:string|undefined)=>{if(v===undefined)throw new Error('Explicit measured amount required.');const x=Exact.from(v);if(x.compare(Exact.from(0))<0)throw new Error('Nonnegative amount required.');return x;};
 if(mode==='absolute'){const x=value(amount);if(x.compare(Exact.from(500))>0)throw new Error('Absolute scale is limited to 500.');return {support:x,sourceAfter:null};}
 if(source===null)throw new Error('Source scale is unavailable.');const s=value(source);
 if(mode==='split-even'){const x=s.div(Exact.from(2));return {support:x,sourceAfter:s.sub(x)};}
 if(mode==='split-uneven'){const x=value(amount);if(x.compare(maximum==='half'?s.div(Exact.from(2)):s)>0)throw new Error(`Support scale must be between 0 and ${maximum==='half'?s.div(Exact.from(2)).number():s.number()}.`);return {support:x,sourceAfter:s.sub(x)};}
 const p=value(percentage);if(p.compare(Exact.from(100))>0)throw new Error('Percentage must be 0-100.');return {support:s.mul(p).div(Exact.from(100)),sourceAfter:null};
}
export function phaseDates(start:string,count:number,length:number) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start)||new Date(start+'T00:00:00Z').toISOString().slice(0,10)!==start||!Number.isSafeInteger(count)||count<1||count>100||!Number.isSafeInteger(length)||length<1||length>366)throw new Error('Valid calendar start, 1-100 tasks and 1-366 days per phase required.');
 return Array.from({length:count},(_,i)=>{const a=new Date(start+'T00:00:00Z');a.setUTCDate(a.getUTCDate()+i*length);const b=new Date(a);b.setUTCDate(b.getUTCDate()+length-1);return {assignedDate:a.toISOString().slice(0,10),dueDate:b.toISOString().slice(0,10)};});
}
export function parsePreview(value:unknown):ToolsPreview {
 if(!value||typeof value!=='object'||!Array.isArray((value as ToolsPreview).items)||typeof (value as ToolsPreview).id!=='string')throw new Error('Task Tools preview is unavailable.');return value as ToolsPreview;
}
