import { writeDatedRecord } from '@/app/records/actions';
import { ExecutionForm } from '@/components/tasks/execution-form';
import { Button } from '@/components/ui/button';
import { canManageAttendance } from '@/lib/attendance/permissions';
import { kolkataDate } from '@/lib/tasks/contract';
import { ATTENDANCE_STATUSES } from '@/lib/tracker/enums';
import type { AttendanceRecord, User } from '@/types/tracker';
export function AttendanceRecordEditor({record,members,user}:{record?:AttendanceRecord;members:readonly User[];user:User}) {
  const time=(stamp:string|null|undefined)=>stamp?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(stamp)):'';
  return <ExecutionForm action={writeDatedRecord} scope={`attendance:${record?.id??'new'}`} className="grid gap-3">
    <input type="hidden" name="kind" value="attendance"/><input type="hidden" name="command" value="save"/><input type="hidden" name="recordId" value={record?.id??''}/><input type="hidden" name="expectedVersion" value={record?.recordVersion??0}/>
    {canManageAttendance(user.role)?<label className="grid gap-1 text-sm">Employee<select name="author_id" defaultValue={record?.userId??user.id} className="rounded border p-2">{members.filter(m=>m.isActive).map(m=><option key={m.id} value={m.id}>{m.fullName}</option>)}</select></label>:<input type="hidden" name="author_id" value={user.id}/>}
    <label className="grid gap-1 text-sm">Business date (Asia/Kolkata)<input type="date" name="business_date" defaultValue={record?.attendanceDate??kolkataDate()} required className="rounded border p-2"/></label>
    <label className="grid gap-1 text-sm">Status<select name="attendance_status" defaultValue={record?.status??'Present'} className="rounded border p-2">{ATTENDANCE_STATUSES.map(s=><option key={s}>{s}</option>)}</select></label>
    <label className="grid gap-1 text-sm">Attendance hours<input type="number" name="attendance_hours" min="0" max="24" step="any" defaultValue={record?.hoursConfirmed?record.attendanceHours:''} required className="rounded border p-2"/></label>
    <label className="grid gap-1 text-sm">Off hours (record separately)<input type="number" name="off_hours" min="0" max="24" step="any" defaultValue={record?.hoursConfirmed?record.offHours:0} required className="rounded border p-2"/></label>
    <p className="text-xs">Regular attendance excludes off-hours. Present/Half Day use measured hours, without 8/4 defaults. Absent/Leave require both zero; Holiday/Off Hours require regular hours zero. Their actual off-hours may be recorded separately.</p>
    <label>Check-in (local)<input name="check_in_time" type="time" defaultValue={time(record?.checkInAt)} className="rounded border p-2"/></label><label>Check-out (local)<input name="check_out_time" type="time" defaultValue={time(record?.checkOutAt)} className="rounded border p-2"/></label>
    <label>Holiday name<input name="holiday_name" defaultValue={record?.holidayName??''} className="rounded border p-2"/></label><label>Notes<textarea name="content" defaultValue={record?.notes??''} className="rounded border p-2"/></label>
    {record?<label>Correction reason<input name="reason" required maxLength={1000} className="rounded border p-2"/></label>:null}
    <Button type="submit" size="sm">{record?'Save attendance correction':'Record measured attendance'}</Button>
  </ExecutionForm>;
}
