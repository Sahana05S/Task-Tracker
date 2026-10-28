import type { createClient } from '@/shared/supabase/server';
import type { AnalyticsPeriod } from '@/modules/scoring/internal/analytics/engine';
import type { CalculationResult,CalculationContext,MemberCalculation } from '@/modules/scoring/internal/performance/engine';
import { selectMonthly,awardContext,type AwardPolicy,type EffectiveAwardDay,type MonthlySelection,type AwardGate } from './contract';
import type { LastDecided } from './display';
export interface AwardDay extends EffectiveAwardDay {version:number;runId:string|null;automaticWinnerId:string|null;lastDecided?:LastDecided|null;override:boolean;reaffirmationRequired?:boolean;overrideReason:string|null;overrideBy:string|null;context:Record<string,unknown>|null;reasons:string[]|null;lastRunAt:string|null;lastSuccessAt:string|null;jobStatus:string|null;lastError:string|null;candidates:{userId:string;calculation:MemberCalculation;gate:AwardGate}[]}
export interface AwardHistory {date:string;runId:string;status:string;recordedStatus:string;calculation:MemberCalculation;calculationContext?:CalculationContext|null;gate:AwardGate;context:Record<string,unknown>;certified:boolean;createdAt:string}
export interface AwardReadModel {days:AwardDay[];history:AwardHistory[];policy:AwardPolicy|null;policyApproved:boolean;scheduleEnabled:boolean;frozen:boolean;sourceWatermark:string;legacy:{date:string;winnerId:string;score:number;ruleVersion:string;certified:boolean}[];monthly:MonthlySelection}
type Db=Awaited<ReturnType<typeof createClient>>;
/**
 * Calls award_read_model, asking it to leave the calculations out unless they
 * are wanted. Until migration 86 reaches a database the extra argument is
 * unknown there (PostgREST PGRST202), so the old call is made instead.
 */
export async function callAwardReadModel(db:Db,args:{p_from:string;p_to_exclusive:string;p_employee:string|null},withCandidates:boolean) {
 const result=await db.rpc('award_read_model',{...args,p_candidates:withCandidates});
 return result.error?.code==='PGRST202'?db.rpc('award_read_model',args):result;
}

/**
 * The award read for a period. Each day's `candidates` (every member's full
 * calculation, about 4 MB a month) come back only with `withCandidates`; only
 * the Team daily performance log reads them (migration 86, 28 October 2026).
 */
export async function getAwards(db:Awaited<ReturnType<typeof createClient>>,period:AnalyticsPeriod,calculation?:CalculationResult,employee?:string,withCandidates=false):Promise<AwardReadModel> {
 const end=new Date(period.endDate+'T00:00:00Z');end.setUTCDate(end.getUTCDate()+1);
 const result=await callAwardReadModel(db,{p_from:period.startDate,p_to_exclusive:end.toISOString().slice(0,10),p_employee:employee??null},withCandidates);
 if(result.error)throw new Error(`Award read failed: ${result.error.message}`);
 const model=result.data as unknown as Omit<AwardReadModel,'monthly'>;
 if(!model||!Array.isArray(model.days)||!Array.isArray(model.history)||!Array.isArray(model.legacy))throw new Error('Award read model unavailable.');
 if(calculation&&model.sourceWatermark!==calculation.context.sourceWatermark)throw new Error('Award and performance sources changed; refresh to read the current context.');
 const required:string[]=[];const now=new Date().toISOString();
 if(model.policy)for(let d=new Date(period.startDate+'T00:00:00Z');d.toISOString().slice(0,10)<=period.endDate;d.setUTCDate(d.getUTCDate()+1)){
  const date=d.toISOString().slice(0,10);if(awardContext(date,now,model.policy).cutoff<=now)required.push(date);
 }
 const unavailable:MonthlySelection={status:model.frozen?'closed':'incomplete',winnerId:null,counts:{},tiedIds:[],reasons:[model.frozen?'frozen_period_retains_original_awards':'shared_monthly_context_unavailable'],missingDates:[],tieBreak:{}};
 return {...model,monthly:!calculation||model.frozen?unavailable:selectMonthly(model.days,required,calculation,model.policy,required.length===Number(period.endDate.slice(-2)))};
}
