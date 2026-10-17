export const SUPPORT_INPUT_VERSION = 'm06-support-inputs-v2';
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
