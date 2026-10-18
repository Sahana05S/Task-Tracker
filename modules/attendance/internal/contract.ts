import type { AttendanceStatus } from '@/types/tracker';

export const ATTENDANCE_INPUT_VERSION = 'm06-attendance-inputs-v2';
export interface AttendanceObservation {
  id: string;
  businessDate: string;
  status: AttendanceStatus;
  attendanceHours: string | null;
  offHours: string | null;
  measured: boolean;
}
export interface AttendanceValidity {
  available: boolean;
  valid: boolean | null;
  reasons: string[];
}
// Exact decimal comparison: measured zero is distinct from missing input.
export function compareRecordedHours(effort: string | null, capacity: string | null): AttendanceValidity {
  if (effort === null || capacity === null) return {available:false,valid:null,reasons:['missing_hours']};
  const parse = (value:string) => {
    if (!/^\d+(\.\d+)?$/.test(value)) throw new Error('Finite nonnegative decimal hours required.');
    const [whole, fraction=''] = value.split('.');
    return {units:BigInt(whole+fraction), places:fraction.length};
  };
  try {
    const a=parse(effort), b=parse(capacity), places=Math.max(a.places,b.places);
    const valid=a.units*BigInt(10)**BigInt(places-a.places)<=b.units*BigInt(10)**BigInt(places-b.places);
    return {available:true,valid,reasons:valid?[]:['effort_exceeds_attendance']};
  } catch {return {available:false,valid:null,reasons:['invalid_hours']};}
}

export { localCheckTime } from '@/shared/time/kolkata';

export function dailyAttendanceValidity(status:AttendanceStatus|null,regular:string|null,offHours:string|null,effort:string|null):AttendanceValidity {
  if(status===null||regular===null||offHours===null||effort===null)return {available:false,valid:null,reasons:['missing_hours']};
  const normalize=(value:string,places:number)=>{
    if(!/^\d+(\.\d+)?$/.test(value))throw new Error('Invalid measured hours');
    const [whole,fraction='']=value.split('.');return BigInt(whole+fraction)*BigInt(10)**BigInt(places-fraction.length);
  };
  try {
    const places=Math.max(...[regular,offHours,effort].map(v=>v.split('.')[1]?.length??0));
    const r=normalize(regular,places),o=normalize(offHours,places),e=normalize(effort,places);
    if(r+o>BigInt(24)*BigInt(10)**BigInt(places))return {available:false,valid:null,reasons:['attendance_hours_invalid']};
    if((['Absent','Leave'].includes(status)&&(r!==BigInt(0)||o!==BigInt(0)))||(['Holiday','Off Hours'].includes(status)&&r!==BigInt(0)))return {available:true,valid:false,reasons:['attendance_state_hours_incompatible']};
    const valid=e<=r+o;return {available:true,valid,reasons:valid?[]:['effort_exceeds_attendance_capacity']};
  }catch{return {available:false,valid:null,reasons:['invalid_hours']};}
}
