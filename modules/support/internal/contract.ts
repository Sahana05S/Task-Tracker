export const SUPPORT_INPUT_VERSION = 'm06-support-inputs-v3';
/** Earlier version still accepted so an un-migrated database shows sales as unavailable instead of failing. */
export const SUPPORT_INPUT_VERSIONS = ['m06-support-inputs-v2', SUPPORT_INPUT_VERSION] as const;
export const RECORD_KINDS=['fact','idea','suggestion','sale','meeting'] as const;
export type RecordKind=typeof RECORD_KINDS[number];
export type ValidationState='legacy_unvalidated'|'pending'|'validated'|'rejected'|'withdrawn';
export const RAW_CONTRIBUTION_COEFFICIENTS={fact:{validated:75,unvalidated:38},idea:{validated:200,unvalidated:75},suggestion:{validated:200,unvalidated:75}} as const;
/** Counts must already belong to an explicitly confirmed population. No state-to-credit guess. */
export function rawContribution(kind:keyof typeof RAW_CONTRIBUTION_COEFFICIENTS,validated:number,eligibleUnvalidated:number):number {
  if(![validated,eligibleUnvalidated].every(n=>Number.isSafeInteger(n)&&n>=0)) throw new Error('Nonnegative integer contribution counts required.');
  const weights=RAW_CONTRIBUTION_COEFFICIENTS[kind];
  const hundredths=BigInt(validated)*BigInt(weights.validated)+BigInt(eligibleUnvalidated)*BigInt(weights.unvalidated);
  if(hundredths>BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Contribution value exceeds safe numerical range.');
  return Number(hundredths)/100;
}
export function contributionFromStates(kind:keyof typeof RAW_CONTRIBUTION_COEFFICIENTS,sources:readonly {state:ValidationState;authorId:string|null;validatorId:string|null;validatedAt:string|null}[],historyKnown:boolean) {
  const validated=sources.filter(s=>s.state==='validated').length,pending=sources.filter(s=>s.state==='pending').length;
  const unknown=sources.some(s=>!['rejected','withdrawn'].includes(s.state)&&(s.authorId===null||s.state==='legacy_unvalidated'||s.state==='validated'&&(s.validatorId===null||s.validatedAt===null||s.validatorId===s.authorId)));
  const reasons=[...(!historyKnown?['history_before_input_baseline']:[]),...(unknown?['legacy_population_or_validation_provenance_missing']:[])];
  return {available:reasons.length===0,rawValue:reasons.length?null:rawContribution(kind,validated,pending),validatedCount:validated,eligibleUnvalidatedCount:pending,reasons};
}
/**
 * Sales (D05, approved 20 October 2026): BN = eligible entries, BO = eligible entries flagged as a
 * new project, BP = eligible entries with the basement payment received.
 * raw = (1.5*BO + BN + 0.75*BP)/50, which equals (6*BO + 4*BN + 3*BP)/200 and is exact in three decimals.
 */
export const SALES_COEFFICIENTS={BO:'1.5',BN:'1',BP:'0.75',divisor:'50'} as const;
export function rawSales(bn:number,bo:number,bp:number):number {
  if(![bn,bo,bp].every(n=>Number.isSafeInteger(n)&&n>=0)) throw new Error('Nonnegative integer sales counts required.');
  if(bo>bn||bp>bn) throw new Error('Flag counts cannot exceed the number of sales entries.');
  const twoHundredths=BigInt(bo)*6n+BigInt(bn)*4n+BigInt(bp)*3n;
  if(twoHundredths>BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Sales value exceeds safe numerical range.');
  return Number(twoHundredths)/200;
}
export interface SalesSource {state:ValidationState;authorId:string|null;validatorId:string|null;validatedAt:string|null;isNewProject:unknown;basementPaymentReceived:unknown}
/** TypeScript mirror of the SQL sales input: same eligibility and provenance rules as facts. */
export function salesFromStates(sources:readonly SalesSource[],historyKnown:boolean) {
  const eligible=sources.filter(s=>s.state==='validated'||s.state==='pending');
  const unknown=sources.some(s=>!['rejected','withdrawn'].includes(s.state)&&(s.authorId===null||s.state==='legacy_unvalidated'||s.state==='validated'&&(s.validatorId===null||s.validatedAt===null||s.validatorId===s.authorId)));
  const flagsMissing=eligible.some(s=>typeof s.isNewProject!=='boolean'||typeof s.basementPaymentReceived!=='boolean');
  const reasons=[...(!historyKnown?['history_before_input_baseline']:[]),...(unknown?['legacy_population_or_validation_provenance_missing']:[]),...(flagsMissing?['sales_flags_missing']:[])];
  const salesCounts={BN:eligible.length,BO:eligible.filter(s=>s.isNewProject===true).length,BP:eligible.filter(s=>s.basementPaymentReceived===true).length};
  return {available:reasons.length===0,rawValue:reasons.length?null:rawSales(salesCounts.BN,salesCounts.BO,salesCounts.BP),
    validatedCount:eligible.filter(s=>s.state==='validated').length,eligibleUnvalidatedCount:eligible.filter(s=>s.state==='pending').length,salesCounts,reasons};
}
export interface DatedRecordMetadata {
  recordVersion?:number;
  validationState?:ValidationState;
  validationAt?:string|null;
  validatorId?:string|null;
  validationReason?:string|null;
  relatedTaskId?:string|null;
}
export interface ScoreInputContext {
  ruleVersion:string;
  periodStart:string;
  periodEndExclusive:string;
  asOf:string;
  available:boolean;
  reasons:string[];
  rawValue:number|null;
  sources:readonly {id:string;attributedTo:string|null;businessDate:string;state:ValidationState}[];
}
