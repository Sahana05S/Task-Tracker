import { classifyFreshness,eligibilityReasons,FRESHNESS_SCORES } from '@/lib/tasks/contract';
import { PRIORITY_WEIGHTS } from '@/lib/tasks/contract';
import type { Task,UserRole } from '@/types/tracker';
import type { ContributionInputContext } from '@/modules/support/client';
import { Exact } from './exact';
import { calculatePerformance,FACTORS,PERFORMANCE_RULE_VERSION,measuredRaw,unavailableRaw,type CalculationContext,type CalculationResult,type Factor,type MemberRawInputs,type Provenance,type RawFactor } from './engine';

export interface SourceMember {id:string;fullName:string;employeeId:string;role:UserRole;active:boolean;revision:string}
export interface SourceTask {
  id:string;tag:string;category:Task['category'];priority:Task['priority'];status:Task['status'];assignedDate:string;dueDate:string|null;completedDate:string|null;
  progress:string|null;scale:string|null;scaleVersion:string;shareVersion:string;creditMode:string;primaryAssignee:string;participants:string[];
  shares:Record<string,number|null>|null;credits:Record<string,string>;taskHours:string;unknownEffect:boolean;revision:string;
  archivedEffectiveDate?:string|null;handoffSuccessorId?:string|null;
  periodCredits?:Record<string,string>;periodCreditUnknown?:boolean;completionShares?:Record<string,number>|null;completionPrimary?:string|null;
}
export interface PerformanceSources {
  contract:'m07-sources-v1';periodStart:string;periodEndExclusive:string;asOf:string;asOfLocalDate:string;
  sourceWatermark:string;historyAvailable:boolean;historyAvailableFrom:string;
  members:SourceMember[];tasks:SourceTask[];
  attendance:{userId:string;hours:string|null;offHours:string|null;available:boolean;valid:boolean|null;reasons:string[];sourceRevision:string}[];
  contributions:ContributionInputContext;
}
/** Explicit M07 choices, approved by the user on 13 October 2026. */
export interface PerformancePolicy {
  id:string;taskPopulation:'eligible_carried_asof';progressWindow:'retained_cumulative'|'period_earned';
  completion:'done_in_period'|'on_time_done_in_period';nonadditiveAttribution:'normalized_shares'|'full_per_assignee'|'primary';
  observedZeroInMedian:boolean;missingPolicy:'exclude_unavailable'|'strict';precisionPolicy:string;displayPlaces:number;
}
export const APPROVED_PERFORMANCE_POLICY:PerformancePolicy={id:'m07-approved-2026-10-13',taskPopulation:'eligible_carried_asof',progressWindow:'period_earned',completion:'done_in_period',nonadditiveAttribution:'normalized_shares',observedZeroInMedian:true,missingPolicy:'exclude_unavailable',precisionPolicy:'exact-intermediates-display-half-away',displayPlaces:2};

export function parsePerformanceSources(value:unknown):PerformanceSources {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Performance source response is missing.');
  const data=value as Record<string,unknown>;
  if(data.contract!=='m07-sources-v1'||typeof data.sourceWatermark!=='string'||typeof data.asOf!=='string'||typeof data.asOfLocalDate!=='string'||typeof data.historyAvailable!=='boolean'||!Array.isArray(data.members)||!Array.isArray(data.tasks)||!Array.isArray(data.attendance)||!data.contributions)throw new Error('Performance source contract is incomplete.');
  return data as unknown as PerformanceSources;
}
function provenance(t:SourceTask):Provenance {return {kind:'task-state',id:t.id,revision:t.revision,scaleVersion:t.scaleVersion,shareVersion:t.shareVersion};}
function attribution(t:SourceTask,policy:PerformancePolicy,completion=false):Record<string,Exact>|null {
  const ids=t.participants;
  if(policy.nonadditiveAttribution==='full_per_assignee')return Object.fromEntries(ids.map(id=>[id,Exact.from(1)]));
  if(policy.nonadditiveAttribution==='primary')return {[completion?(t.completionPrimary??t.primaryAssignee):t.primaryAssignee]:Exact.from(1)};
  const shares=completion?t.completionShares:t.shares;
  if(!shares||Object.values(shares).some(v=>!Number.isInteger(v)||v===null||v<0)||Object.values(shares).reduce<number>((sum,v)=>sum+(v??0),0)!==1_000_000)return null;
  return Object.fromEntries(Object.entries(shares).map(([id,units])=>[id,Exact.from(units!).div(Exact.from(1_000_000))]));
}
/** Archive dates affect carried work only; later archives cannot erase earlier periods. */
export function archiveAffectsCarriedWindow(date:string|null|undefined,periodEndExclusive:string,asOfLocalDate:string):boolean {
  return !!date&&date<=asOfLocalDate&&date<periodEndExclusive;
}
export function resolvePerformance(sources:PerformanceSources,policy:PerformancePolicy|null=APPROVED_PERFORMANCE_POLICY):CalculationResult {
  const members=sources.members.filter(m=>m.active),ids=members.map(m=>m.id);
  const context:CalculationContext={ruleVersion:PERFORMANCE_RULE_VERSION,periodStart:sources.periodStart,periodEndExclusive:sources.periodEndExclusive,asOf:sources.asOf,asOfLocalDate:sources.asOfLocalDate,timezone:'Asia/Kolkata',
    sourceWatermark:sources.sourceWatermark,attributionPolicy:policy?.nonadditiveAttribution??null,precisionPolicy:policy?.precisionPolicy??null,displayPlaces:policy?.displayPlaces??null,factorDisplayPlaces:policy?6:null,
    windows:Object.fromEntries(FACTORS.map(f=>[f,policy?(f==='progress'||f==='productivity'?policy.progressWindow:['sales','facts','ideas','suggestions','completion'].includes(f)?'period_to_asof':'eligible_carried_asof'):null])) as CalculationContext['windows'],
    cohorts:Object.fromEntries(FACTORS.map(f=>[f,policy?{id:`${policy.id}:${f}:${sources.periodStart}:${sources.periodEndExclusive}:${sources.asOf}:${sources.sourceWatermark}`,memberIds:ids,missingPolicy:policy.missingPolicy,includeObservedZero:policy.observedZeroInMedian}:null])) as CalculationContext['cohorts']};
  const taskValues=sources.tasks.map(t=>{
    try{
      const scale=t.scale===null?null:Exact.from(t.scale),progress=t.progress===null?null:Exact.from(t.progress);
      const reasons=eligibilityReasons({taskScale:scale?.number()??null,progressPercentage:progress?.number()??null,status:t.status,priority:t.priority});
      return {t,scale,progress,reasons,eligible:reasons.length===0&&t.assignedDate<=sources.asOfLocalDate&&t.assignedDate<sources.periodEndExclusive&&!(t.completedDate&&t.completedDate<sources.periodStart)};
    }catch{return {t,scale:null,progress:null,reasons:['task_numeric_source_invalid'],eligible:false};}
  });
  const carried=taskValues.filter(({t,eligible})=>eligible&&!archiveAffectsCarriedWindow(t.archivedEffectiveDate,sources.periodEndExclusive,sources.asOfLocalDate)),scaleTotal=carried.reduce((sum,t)=>sum.add(t.scale!),Exact.from(0));
  const input:MemberRawInputs[]=members.map(member=>{
    const factors=Object.fromEntries(FACTORS.map(f=>[f,unavailableRaw('factor_policy_unapproved')])) as Record<Factor,RawFactor>;
    const contributions=sources.contributions.employeeFactors.find(row=>row.userId===member.id);
    for(const [factor,key] of [['facts','fact'],['ideas','idea'],['suggestions','suggestion'],['sales','sale']] as const){
      const raw=contributions?.factors[key];const refs=sources.contributions.sources.filter(s=>s.kind===key&&s.attributedTo===member.id).map(s=>({kind:key,id:s.id,revision:String(s.version),businessDate:s.businessDate,exclusionReasons:s.exclusionReason?[s.exclusionReason]:s.provenanceReason?[s.provenanceReason]:[]}));
      factors[factor]=raw?.available&&raw.rawValue!==null?measuredRaw(String(raw.rawValue),refs):{value:null,available:false,reasons:raw?.reasons??['contribution_source_missing'],sources:refs};
    }
    const attendance=sources.attendance.find(a=>a.userId===member.id),eligibility:string[]=[];
    if(attendance?.valid===false)eligibility.push('attendance_invalid');
    else if(attendance?.valid!==true)eligibility.push('attendance_unavailable');
    if(!sources.historyAvailable){for(const f of ['productivity','criticality','loading','completion','progress','freshness'] as const)factors[f]=unavailableRaw('task_history_before_observed_baseline');}
    else if(policy){
      const sums={scale:Exact.from(0),progress:Exact.from(0),criticality:Exact.from(0),freshness:Exact.from(0),completion:Exact.from(0)},reasons:Partial<Record<Factor,string[]>>={},refs:Provenance[]=[];
      const fail=(f:Factor,reason:string)=>{(reasons[f]??=[]).push(reason);};
      for(const item of taskValues){
        const t=item.t,involves=t.participants.includes(member.id)||Object.hasOwn(t.credits,member.id)||Object.hasOwn(t.periodCredits??{},member.id)||Object.hasOwn(t.completionShares??{},member.id);
        if(!involves)continue;
        const archived=archiveAffectsCarriedWindow(t.archivedEffectiveDate,sources.periodEndExclusive,sources.asOfLocalDate);
        refs.push({...provenance(t),exclusionReasons:[...item.reasons,...(archived?['archived_excluded_from_carried_workload']:[]),...(t.assignedDate>=sources.periodEndExclusive?['task_assigned_after_report_period']:[]),...(t.assignedDate>sources.asOfLocalDate?['task_assignment_after_asof']:[]),...(t.completedDate&&t.completedDate<sources.periodStart?['task_completed_before_report_period']:[])]});
        if(item.reasons.every(reason=>reason==='scale_nonpositive')&&t.assignedDate<=sources.asOfLocalDate&&t.assignedDate<sources.periodEndExclusive&&policy.progressWindow==='period_earned'){
          if(t.periodCreditUnknown||!t.periodCredits)fail('progress','period_earned_credit_unknown');
          else if(Object.hasOwn(t.periodCredits,member.id))sums.progress=sums.progress.add(Exact.from(t.periodCredits[member.id]));
        }
        if(!item.eligible)continue;
        if(t.status==='Done'&&(!t.completedDate||t.completedDate>sources.asOfLocalDate||item.progress?.compare(Exact.from(100))!==0)){
          fail('completion','completion_observation_inconsistent');if(!archived)fail('freshness','completion_observation_inconsistent');
        }
        if(t.status==='Done'&&t.completedDate&&t.completedDate>=sources.periodStart&&t.completedDate<sources.periodEndExclusive&&t.completedDate<=sources.asOfLocalDate&&(policy.completion==='done_in_period'||!!t.dueDate&&t.completedDate<=t.dueDate)){
          const completedAllocation=attribution(t,policy,true);
          if(!completedAllocation)fail('completion','completion_participant_history_unknown');else if(completedAllocation[member.id])sums.completion=sums.completion.add(completedAllocation[member.id]);
        }
        if(policy.progressWindow==='retained_cumulative'){
          if(t.unknownEffect||t.creditMode!=='configured')fail('progress','earned_credit_provenance_unknown');
          else if(Object.hasOwn(t.credits,member.id))sums.progress=sums.progress.add(Exact.from(t.credits[member.id]));
        }
        if(archived)continue;
        const share=t.creditMode==='configured'&&t.shares&&Object.values(t.shares).every(v=>v!==null&&Number.isInteger(v)&&v>=0)&&Object.values(t.shares).reduce<number>((sum,v)=>sum+(v??0),0)===1_000_000?(t.shares[member.id]??0):null;
        if(share===null||share===undefined)fail('loading','participant_share_history_unknown');else sums.scale=sums.scale.add(item.scale!.mul(Exact.from(share).div(Exact.from(1_000_000))));
        const allocation=attribution(t,policy);
        if(!allocation){fail('criticality','nonadditive_share_history_unknown');fail('freshness','nonadditive_share_history_unknown');}
        else if(allocation[member.id]){
          sums.criticality=sums.criticality.add(Exact.from(PRIORITY_WEIGHTS[t.priority]).mul(allocation[member.id]));
          const freshness=classifyFreshness({assignedDate:t.assignedDate,dueDate:t.dueDate,completedDate:t.completedDate,status:t.status},sources.asOfLocalDate);
          if(freshness.state===null)fail('freshness',freshness.reason??'freshness_unavailable');else sums.freshness=sums.freshness.add(Exact.from(FRESHNESS_SCORES[freshness.state]).mul(allocation[member.id]));
        }

      }
      const raw=(f:Factor,value:Exact)=>reasons[f]?.length?{value:null,available:false,reasons:[...new Set(reasons[f])],sources:refs}:measuredRaw(value.json(),refs);
      factors.progress=raw('progress',sums.progress);factors.criticality=raw('criticality',sums.criticality);factors.freshness=raw('freshness',sums.freshness);factors.completion=raw('completion',sums.completion);
      factors.loading=scaleTotal.compare(Exact.from(0))>0?raw('loading',sums.scale.div(scaleTotal)):unavailableRaw('team_assigned_scale_zero',refs);
      if(!factors.progress.available)factors.productivity={...factors.progress,reasons:[...factors.progress.reasons,'productivity_numerator_unavailable']};
      else if(!attendance?.available||attendance.hours===null)factors.productivity=unavailableRaw('attendance_denominator_missing',refs);
      else if(Exact.from(attendance.hours).compare(Exact.from(0))<=0)factors.productivity=unavailableRaw('attendance_denominator_zero',refs);
      else factors.productivity=measuredRaw(sums.progress.div(Exact.from(attendance.hours)).json(),[...refs,{kind:'attendance-aggregate',id:member.id,revision:attendance.sourceRevision}]);
    }
    return {userId:member.id,factors,eligibilityReasons:eligibility};
  });
  const result=calculatePerformance(context,input);
  if(!sources.historyAvailable)result.reasons.push('task_and_member_history_before_observed_baseline');
  return result;
}
export function taskProductivity(progress:string|null,hours:string|null):RawFactor {
  if(progress===null||hours===null)return unavailableRaw('task_rate_source_missing');
  try{const denominator=Exact.from(hours);if(denominator.compare(Exact.from(0))<=0)return unavailableRaw('task_hours_zero');return measuredRaw(Exact.from(progress).div(denominator).json());}catch{return unavailableRaw('task_rate_source_invalid');}
}
