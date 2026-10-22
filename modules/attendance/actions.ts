'use server';
import { createHash } from 'node:crypto';

import { writeDatedRecord } from '@/modules/records/actions';
import { fillCommand, type DayFill } from '@/modules/attendance/internal/matrix';
import { canManageAttendance } from '@/modules/attendance/internal/permissions';
import { getCurrentProfile } from '@/shared/session/profile';
import { ISO_DATE_PATTERN, UUID_PATTERN } from '@/shared/forms/form-data';
import type { ActionResponse } from '@/types/tracker';

export async function saveAttendanceRecord(form:FormData){form.set('kind','attendance');return writeDatedRecord(form);}

const FILLS:readonly DayFill[]=['Holiday','Present','Half Day'];

/** A stable per-member operation id derived from the form's one, so a resubmitted fill replays instead of repeating. */
function memberOperation(base:string,memberId:string,date:string):string{
 const hex=createHash('sha256').update(`${base}:${memberId}:${date}`).digest('hex');
 return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
}

/**
 * Fills one day for the members whose cell is empty: a holiday for everyone,
 * or the usual 8 h (Present) / 4 h (Half Day). Each member gets an ordinary
 * new attendance record through the dated-record command, which checks
 * permissions and refuses a day that already has a record; existing records
 * are never overwritten. Results are reported per member.
 */
export async function fillAttendanceDay(form:FormData):Promise<ActionResponse<{saved:number;skipped:string[]}>>{
 const profile=await getCurrentProfile();
 if(!profile?.isActive||!canManageAttendance(profile.role))return {success:false,error:'Only the managing director or a project engineer can fill a day for everyone.',errorCode:'forbidden'};
 const date=String(form.get('date')??''),fill=String(form.get('fill')??'') as DayFill,holidayName=String(form.get('holidayName')??'').trim(),operation=String(form.get('operationId')??'');
 const members=form.getAll('memberId').map(String);
 if(!ISO_DATE_PATTERN.test(date)||!FILLS.includes(fill)||!UUID_PATTERN.test(operation)||!members.length||!members.every(id=>UUID_PATTERN.test(id)))return {success:false,error:'Choose a day, what to fill and at least one member.',errorCode:'validation'};
 if(fill==='Holiday'&&!holidayName)return {success:false,error:'Name the holiday.',errorCode:'validation'};
 const results=await Promise.all(members.map(async memberId=>{
  const record=new FormData();
  for(const [key,value] of Object.entries(fillCommand(memberId,date,fill,holidayName)))record.set(key,value);
  record.set('operationId',memberOperation(operation,memberId,date));
  return {memberId,result:await writeDatedRecord(record)};
 }));
 const failed=results.filter(r=>!r.result.success);
 const first=failed[0]?.result;
 if(first&&!first.success&&failed.length===results.length)return {success:false,error:first.error,errorCode:first.errorCode??'validation'};
 return {success:true,data:{saved:results.length-failed.length,skipped:failed.map(r=>r.memberId)}};
}
