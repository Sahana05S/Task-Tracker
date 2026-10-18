import type { CalculationResult,MemberCalculation } from '@/modules/scoring/internal/performance/engine';
import { Exact,type ExactValue } from '@/shared/math/exact';

export const AWARD_RULE_VERSION='m08-shared-performance-v1';
export interface AwardPolicy {
 id:string;window:'one_day'|'month_to_date';cutoffHour:number;cutoffMinute:number;cutoffDayOffset:0|1;cutoffSecond?:number;cutoffMillisecond?:number;
 requirePositiveDayAttendance:boolean;exactTie:'no_winner'|'unresolved';override:'eligible_complete_replace'|'unresolved';
}
/** All three D10 recommendations were approved on 13 October 2026. */
export const APPROVED_AWARD_POLICY:AwardPolicy={id:'m08-approved-2026-10-13',window:'month_to_date',cutoffHour:23,cutoffMinute:59,cutoffSecond:59,cutoffMillisecond:999,cutoffDayOffset:0,requirePositiveDayAttendance:true,exactTie:'no_winner',override:'eligible_complete_replace'};
export interface AwardGate {userId:string;state:'eligible'|'ineligible'|'unavailable';reasons:string[]}
export interface AwardCandidate {userId:string;gate:AwardGate;calculation:MemberCalculation}
export interface DailySelection {
 status:'completed_winner'|'completed_none'|'blocked';winnerId:string|null;tiedIds:string[];reasons:string[];
 candidates:AwardCandidate[];calculation:CalculationResult;
}
export function selectDaily(calculation:CalculationResult,gates:readonly AwardGate[],policy:AwardPolicy|null=APPROVED_AWARD_POLICY):DailySelection {
 const candidates=calculation.members.map(member=>({userId:member.userId,calculation:member,gate:gates.find(g=>g.userId===member.userId)??{userId:member.userId,state:'unavailable' as const,reasons:['candidate_gate_missing']}}));
 const result=(status:DailySelection['status'],reasons:string[],winnerId:string|null=null,tiedIds:string[]=[]):DailySelection=>({status,winnerId,tiedIds,reasons,candidates,calculation});
 if(new Set(gates.map(g=>g.userId)).size!==gates.length||gates.some(g=>!calculation.members.some(m=>m.userId===g.userId)))return result('blocked',['candidate_population_mismatch']);
 if(!policy)return result('blocked',['award_policy_unapproved']);
 if(calculation.status!=='complete'||calculation.members.some(m=>m.status!=='complete'||m.compositeExact===null))return result('blocked',['shared_calculation_incomplete',...calculation.reasons]);
 if(candidates.some(c=>c.gate.state==='unavailable'))return result('blocked',['candidate_evidence_unavailable']);
 const eligible=candidates.filter(c=>c.gate.state==='eligible'&&c.calculation.eligibleForRanking);
 if(!eligible.length)return result('completed_none',['no_eligible_candidates']);
 let best:Exact|null=null,tied:string[]=[];
 for(const c of eligible){const score=Exact.from(c.calculation.compositeExact!);if(best===null||score.compare(best)>0){best=score;tied=[c.userId];}else if(score.compare(best)===0)tied.push(c.userId);}
 if(tied.length>1)return policy.exactTie==='unresolved'?result('blocked',['exact_tie_policy_unapproved'],null,tied):result('completed_none',['exact_highest_score_tie'],null,tied);
 return result('completed_winner',[],tied[0]);
}
export interface EffectiveAwardDay {date:string;status:DailySelection['status']|'failed'|'missing'|'stale';winnerId:string|null;certified:boolean}
export interface MonthlySelection {status:'provisional'|'complete'|'incomplete'|'closed';winnerId:string|null;counts:Record<string,number>;tiedIds:string[];reasons:string[];missingDates:string[];tieBreak:Record<string,ExactValue|null>}
export function selectMonthly(days:readonly EffectiveAwardDay[],requiredDates:readonly string[],performance:CalculationResult,policy:AwardPolicy|null=APPROVED_AWARD_POLICY,periodComplete=false):MonthlySelection {
 const counts:Record<string,number>={},missingDates:string[]=[],reasons:string[]=[],tieBreak:Record<string,ExactValue|null>={};
 if(new Set(requiredDates).size!==requiredDates.length||new Set(days.map(d=>d.date)).size!==days.length)throw new Error('Duplicate award date.');
 for(const date of requiredDates){const day=days.find(d=>d.date===date);if(!day||!day.certified||!['completed_winner','completed_none'].includes(day.status))missingDates.push(date);else if(day.status==='completed_winner'){if(!day.winnerId){missingDates.push(date);continue;}counts[day.winnerId]=(counts[day.winnerId]??0)+1;}}
 if(!policy)reasons.push('award_policy_unapproved');if(missingDates.length)reasons.push('daily_coverage_incomplete');
 const result=(winnerId:string|null,tiedIds:string[]=[]):MonthlySelection=>({status:reasons.length?'incomplete':periodComplete?'complete':'provisional',winnerId:reasons.length?null:winnerId,counts,tiedIds,reasons,missingDates,tieBreak});
 if(reasons.length)return result(null);
 const highest=Math.max(0,...Object.values(counts));if(!highest){reasons.push('no_effective_daily_wins');return {...result(null),status:periodComplete?'complete':'provisional'};}
 let tied=Object.keys(counts).filter(id=>counts[id]===highest);if(tied.length===1)return result(tied[0]);
 let best:Exact|null=null,winners:string[]=[];
 for(const id of tied){const member=performance.members.find(m=>m.userId===id);tieBreak[id]=member?.status==='complete'&&member.eligibleForRanking?member.compositeExact:null;
  if(tieBreak[id]===null){reasons.push('monthly_tie_break_unavailable');continue;}
  const score=Exact.from(tieBreak[id]!);if(best===null||score.compare(best)>0){best=score;winners=[id];}else if(score.compare(best)===0)winners.push(id);
 }
 if(reasons.length)return result(null,tied);
 tied=winners;if(tied.length>1){if(policy!.exactTie==='unresolved')reasons.push('exact_tie_policy_unapproved');else reasons.push('exact_monthly_tie');return {...result(null,tied),status:policy!.exactTie==='unresolved'?'incomplete':periodComplete?'complete':'provisional'};}
 return result(tied[0]);
}
export function awardContext(date:string,asOf:string,policy:AwardPolicy) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw new Error('Valid Kolkata award date required.');
 const next=new Date(date+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);
 const cutoffDay=new Date(date+'T00:00:00Z');cutoffDay.setUTCDate(cutoffDay.getUTCDate()+policy.cutoffDayOffset);
 if(!Number.isInteger(policy.cutoffHour)||policy.cutoffHour<0||policy.cutoffHour>23||!Number.isInteger(policy.cutoffMinute)||policy.cutoffMinute<0||policy.cutoffMinute>59)throw new Error('Valid approved cutoff required.');
 const second=policy.cutoffSecond??0,millisecond=policy.cutoffMillisecond??0;
 if(!Number.isInteger(second)||second<0||second>59||!Number.isInteger(millisecond)||millisecond<0||millisecond>999)throw new Error('Valid approved cutoff precision required.');
 const cutoff=new Date(`${cutoffDay.toISOString().slice(0,10)}T${String(policy.cutoffHour).padStart(2,'0')}:${String(policy.cutoffMinute).padStart(2,'0')}:${String(second).padStart(2,'0')}.${String(millisecond).padStart(3,'0')}+05:30`).toISOString();
 return {awardRuleVersion:AWARD_RULE_VERSION,policyId:policy.id,businessDate:date,cutoff,asOf,periodStart:policy.window==='month_to_date'?date.slice(0,8)+'01':date,periodEndExclusive:next.toISOString().slice(0,10),timezone:'Asia/Kolkata' as const};
}
