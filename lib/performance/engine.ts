import { Exact,exactMedian,type ExactInput,type ExactValue } from './exact';

export const PERFORMANCE_RULE_VERSION='m07-ten-factor-v1';
export const FACTORS=['productivity','criticality','loading','completion','progress','sales','facts','ideas','suggestions','freshness'] as const;
export type Factor=typeof FACTORS[number];
export const COEFFICIENTS:Record<Factor,string>={productivity:'1.5',criticality:'0.5',loading:'40',completion:'1.5',progress:'0.0125',sales:'1',facts:'1',ideas:'1',suggestions:'1',freshness:'1'};
export const FACTOR_UNITS:Record<Factor,string>={productivity:'scaled progress / attendance hour',criticality:'priority weight sum',loading:'fraction 0-1',completion:'completion count',progress:'scaled progress units',sales:'sales raw units',facts:'fact raw units',ideas:'idea raw units',suggestions:'suggestion raw units',freshness:'freshness weight sum'};
export interface Provenance {kind:string;id:string;revision:string;businessDate?:string;scaleVersion?:string;shareVersion?:string;exclusionReasons?:string[]}
export interface RawFactor {value:ExactInput|null;available:boolean;reasons:string[];sources:Provenance[]}
export interface FactorCohort {id:string;memberIds:string[];missingPolicy:'exclude_unavailable'|'strict';includeObservedZero:boolean}
export interface CalculationContext {
  ruleVersion:string;periodStart:string;periodEndExclusive:string;asOf:string;asOfLocalDate:string;timezone:'Asia/Kolkata';
  windows:Record<Factor,string|null>;cohorts:Record<Factor,FactorCohort|null>;
  attributionPolicy:string|null;sourceWatermark:string;precisionPolicy:string|null;displayPlaces:number|null;
  factorDisplayPlaces?:number|null;
}
export interface MemberRawInputs {userId:string;factors:Record<Factor,RawFactor>;eligibilityReasons:string[]}
export interface FactorResult {
  unit:string;rawValue:number|null;rawExact:ExactValue|null;available:boolean;reasons:string[];sources:Provenance[];
  cohortId:string|null;population:string[];excludedPopulation:{userId:string;reasons:string[]}[];
  median:number|null;medianExact:ExactValue|null;delta:number|null;deltaExact:ExactValue|null;coefficient:string;
  contribution:number|null;contributionExact:ExactValue|null;
}
export interface MemberCalculation {
  userId:string;status:'complete'|'incomplete';factors:Record<Factor,FactorResult>;composite:number|null;compositeExact:ExactValue|null;
  knownSubtotal:number;knownSubtotalExact:ExactValue;subtotalLabel:'Available-factor subtotal';reasons:string[];eligibleForRanking:boolean;
}
export interface CalculationResult {context:CalculationContext;status:'complete'|'incomplete';members:MemberCalculation[];reasons:string[]}
export const unavailableRaw=(reason:string,sources:Provenance[]=[]):RawFactor=>({value:null,available:false,reasons:[reason],sources});
export const measuredRaw=(value:ExactInput,sources:Provenance[]=[]):RawFactor=>({value,available:true,reasons:[],sources});

/** This is the only composite engine. It never selects a winner or invents a cohort. */
export function calculatePerformance(context:CalculationContext,inputs:readonly MemberRawInputs[]):CalculationResult {
  if(context.ruleVersion!==PERFORMANCE_RULE_VERSION||context.timezone!=='Asia/Kolkata')throw new Error('Unsupported performance contract.');
  if(new Set(inputs.map(m=>m.userId)).size!==inputs.length)throw new Error('Duplicate member input.');
  const raws=new Map<string,Record<Factor,{raw:RawFactor;exact:Exact|null}>>();
  for(const member of inputs)raws.set(member.userId,Object.fromEntries(FACTORS.map(factor=>{
    const raw=member.factors[factor];let exact:Exact|null=null;
    if(raw.available&&raw.value!==null)try{exact=Exact.from(raw.value);exact.number();if(factor==='loading'&&(exact.compare(Exact.from(0))<0||exact.compare(Exact.from(1))>0))throw new Error('Loading must be fractional.');}catch{ return [factor,{raw:{...raw,available:false,reasons:[...raw.reasons,'invalid_numeric_source']},exact:null}]; }
    return [factor,{raw,exact}];
  })) as Record<Factor,{raw:RawFactor;exact:Exact|null}>);
  const populations=Object.fromEntries(FACTORS.map(factor=>{
    const cohort=context.cohorts[factor],values:Exact[]=[],included:string[]=[],excluded:{userId:string;reasons:string[]}[]=[];
    if(cohort){if(new Set(cohort.memberIds).size!==cohort.memberIds.length)throw new Error('Duplicate cohort member.');
      for(const id of cohort.memberIds){const entry=raws.get(id)?.[factor];
        if(!entry?.exact)excluded.push({userId:id,reasons:entry?.raw.reasons.length?entry.raw.reasons:['raw_input_missing']});
        else if(!cohort.includeObservedZero&&entry.exact.compare(Exact.from(0))===0)excluded.push({userId:id,reasons:['zero_excluded_by_cohort']});
        else{included.push(id);values.push(entry.exact);}
      }
    }
    const median=cohort&&!(cohort.missingPolicy==='strict'&&excluded.length)?exactMedian(values):null;
    return [factor,{cohort,median,included,excluded}];
  })) as Record<Factor,{cohort:FactorCohort|null;median:Exact|null;included:string[];excluded:{userId:string;reasons:string[]}[]}>;
  const members=inputs.map(member=>{
    let subtotal=Exact.from(0);const reasons=[...member.eligibilityReasons];
    const factors=Object.fromEntries(FACTORS.map(factor=>{
      const entry=raws.get(member.userId)![factor],p=populations[factor],factorReasons=[...entry.raw.reasons];
      if(!entry.exact)factorReasons.push('raw_input_unavailable');
      if(!p.cohort)factorReasons.push('factor_cohort_unapproved');
      else if(!p.included.includes(member.userId))factorReasons.push('member_excluded_from_factor_cohort');
      if(!p.median)factorReasons.push('factor_median_unavailable');
      if(!context.windows[factor])factorReasons.push('factor_window_unapproved');
      const available=factorReasons.length===0&&entry.exact!==null&&p.median!==null;
      const delta=available?entry.exact!.sub(p.median!):null,weighted=delta?.mul(Exact.from(COEFFICIENTS[factor]))??null;
      if(weighted)subtotal=subtotal.add(weighted);else reasons.push(...factorReasons.map(reason=>`${factor}:${reason}`));
      return [factor,{unit:FACTOR_UNITS[factor],rawValue:entry.exact?.number()??null,rawExact:entry.exact?.json()??null,available,reasons:[...new Set(factorReasons)],sources:entry.raw.sources,
        cohortId:p.cohort?.id??null,population:p.included,excludedPopulation:p.excluded,median:p.median?.number()??null,medianExact:p.median?.json()??null,
        delta:delta?.number()??null,deltaExact:delta?.json()??null,coefficient:COEFFICIENTS[factor],contribution:weighted?.number()??null,contributionExact:weighted?.json()??null}];
    })) as Record<Factor,FactorResult>;
    if(!context.precisionPolicy)reasons.push('precision_policy_unapproved');
    const complete=FACTORS.every(f=>factors[f].available)&&context.precisionPolicy!==null;
    return {userId:member.userId,status:complete?'complete' as const:'incomplete' as const,factors,composite:complete?subtotal.number():null,compositeExact:complete?subtotal.json():null,
      knownSubtotal:subtotal.number(),knownSubtotalExact:subtotal.json(),subtotalLabel:'Available-factor subtotal' as const,reasons:[...new Set(reasons)],eligibleForRanking:complete&&member.eligibilityReasons.length===0};
  });
  return {context,status:members.length&&members.every(m=>m.status==='complete')?'complete':'incomplete',members,reasons:members.length?[...new Set(members.flatMap(m=>m.reasons))]:['empty_member_population']};
}
