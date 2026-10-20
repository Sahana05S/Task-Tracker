import type { Json } from '@/types/database';
import type { createClient } from '@/shared/supabase/server';
import type { AttendanceStatus } from '@/types/tracker';
import { SUPPORT_INPUT_VERSIONS, type ValidationState } from './contract';
export interface InputContext { ruleVersion:string; available?:boolean; validityAvailable?:boolean; reasons:string[]; [key:string]:unknown }
export interface FactorInput {available:boolean;rawValue:number|null;reasons:string[];validatedCount:number;eligibleUnvalidatedCount:number;salesCounts?:{BN:number;BO:number;BP:number}}
export interface ContributionObservation {
  id:string;kind:'fact'|'idea'|'suggestion'|'sale';version:number;attributedTo:string|null;
  businessDate:string;state:ValidationState;validator:string|null;validatedAt:string|null;
  observedAt:string;provenanceReason:string|null;exclusionReason:string|null;
  salesFields:{builtUpAreaSource:string|null;isNewProject:boolean;basementPaymentReceived:boolean}|null;
}
export interface ContributionInputContext extends InputContext {
  periodStart:string;periodEndExclusive:string;asOf:string;historyAvailableFrom:string;historyAvailable:boolean;
  sources:ContributionObservation[];
  populations:{kind:string;author:string|null;state:ValidationState;count:number}[];
  factors:Record<'fact'|'idea'|'suggestion'|'sale',FactorInput>;
  employeeFactors:{userId:string;factors:Record<'fact'|'idea'|'suggestion'|'sale',FactorInput>}[];
  salesMapping?:{approved:string;decision:string;BN:string;BO:string;BP:string;businessDate:string};
}
export interface AttendanceDayInput {
  businessDate:string;attendanceId:string|null;attendanceVersion:number|null;status:AttendanceStatus|null;
  attendanceHours:string|null;offHours:string|null;capacityHours:string|null;effortHours:string|null;
  effortSources:{id:string;version:number;taskId:string;timerId:string|null;segmentNumber:number|null}[];
  available:boolean;valid:boolean|null;reasons:string[];
}
export interface AttendanceInputContext extends InputContext {
  userId:string;periodStart:string;periodEndExclusive:string;asOf:string;
  historyAvailableFrom:string;historyAvailable:boolean;valid:boolean|null;days:AttendanceDayInput[];
}
export function parseInputContext(value:Json):InputContext {
  if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.ruleVersion!=='string'||!Array.isArray(value.reasons)||!value.reasons.every(r=>typeof r==='string'))throw new Error('Dated source inputs unavailable: invalid response.');
  return value as unknown as InputContext;
}
export async function loadContributionContext(db:Awaited<ReturnType<typeof createClient>>,from:string,toExclusive:string,asOf:string) {
  const {data,error}=await db.rpc('contribution_input_context',{p_from:from,p_to_exclusive:toExclusive,p_as_of:asOf});
  if(error)throw new Error(`Contribution source query failed: ${error.message}`);
  const parsed=parseInputContext(data);
  if(!(SUPPORT_INPUT_VERSIONS as readonly string[]).includes(parsed.ruleVersion)||!Array.isArray(parsed.sources)||!Array.isArray(parsed.populations)||!Array.isArray(parsed.employeeFactors)||!parsed.factors)throw new Error('Contribution inputs unavailable: incomplete source context.');
  return parsed as ContributionInputContext;
}
export async function loadAttendanceContext(db:Awaited<ReturnType<typeof createClient>>,userId:string,from:string,toExclusive:string,asOf:string) {
  const {data,error}=await db.rpc('attendance_input_context',{p_user:userId,p_from:from,p_to_exclusive:toExclusive,p_as_of:asOf});
  if(error)throw new Error(`Attendance source query failed: ${error.message}`);
  const parsed=parseInputContext(data);
  if(parsed.ruleVersion!=='m06-attendance-inputs-v2'||!Array.isArray(parsed.days))throw new Error('Attendance inputs unavailable: incomplete source context.');
  return parsed as AttendanceInputContext;
}
