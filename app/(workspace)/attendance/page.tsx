import Link from 'next/link';
import { CalendarCheckIcon, CalendarPlusIcon, HistoryIcon, InfoIcon } from 'lucide-react';
import { InitialsAvatar, MissionEmpty, MissionNotice, MissionPage, MissionPageHeader, MissionPanel } from '@/components/missions/mission-ui';
import { AttendanceRecordEditor } from '@/components/support/attendance-record-editor';
import { requireProfile } from '@/lib/auth/profile';
import { canManageAttendance } from '@/lib/attendance/permissions';
import { getAttendanceModuleData } from '@/lib/attendance/queries';
import { kolkataDate } from '@/lib/tasks/contract';
import { currentPeriod } from '@/lib/analytics/engine';
import { formatHours } from '@/lib/tracker/format';
import { cn } from '@/lib/utils';
export default async function AttendancePage() {
 const user=await requireProfile(),period=currentPeriod(new Date(kolkataDate()+'T12:00:00Z')),manager=canManageAttendance(user.role);
 const data=await getAttendanceModuleData({startDate:period.startDate,endDate:period.endDate,viewerId:user.id,canManage:manager});
 const names=new Map(data.members.map(m=>[m.id,m.fullName]));
 return <MissionPage>
  <MissionPageHeader eyebrow="Records" title="Attendance" description={`${period.label} - measured attendance, effort and off hours`}/>
  <div className="grid gap-5 lg:gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
   <aside className="h-fit xl:sticky xl:top-[calc(var(--spacing-header)+1.5rem)]"><MissionPanel icon={CalendarPlusIcon} title="Record attendance"><AttendanceRecordEditor members={data.members} user={user}/></MissionPanel></aside>
   <main className="grid min-w-0 content-start gap-5 lg:gap-6">
    <MissionNotice icon={InfoIcon}>Each elapsed local day needs measured attendance. Task effort must fit within regular attendance plus separately recorded off-hours. Absent/Leave have zero hours; Holiday/Off Hours have only off-hours. Attendance is a gate, not a score bonus.</MissionNotice>
    {[...data.inputContexts].map(([id,context])=>{const state=context.validityAvailable?(context.valid?'Valid':'Invalid'):'Unavailable';return <section className="soft-card p-5 sm:p-6" key={id}><h2 className="text-foreground flex flex-wrap items-center gap-2.5 text-base font-bold tracking-tight"><InitialsAvatar name={names.get(id)??'Employee'}/>{names.get(id)??'Employee'} - period validity: <span className={cn('badge-soft',state==='Valid'?'badge-status-done':state==='Invalid'?'bg-rose-100 text-rose-800':'badge-neutral')}>{state}</span></h2><div className="border-border mt-4 overflow-x-auto rounded-xl border"><table className="sheet-grid min-w-[48rem]"><thead><tr><th>Date</th><th>Status</th><th>Regular hours</th><th>Off hours</th><th>Task effort</th><th>Validity</th></tr></thead><tbody>{context.days.map(day=><tr key={day.businessDate}><td className="tabular-nums">{day.businessDate}</td><td>{day.status??'Missing record'}</td><td className="tabular-nums">{day.attendanceHours==null?'Unavailable':formatHours(day.attendanceHours)}</td><td className="tabular-nums">{day.offHours==null?'Unavailable':formatHours(day.offHours)}</td><td className="tabular-nums">{day.effortHours==null?'Unavailable':formatHours(day.effortHours)}</td><td><span className={cn('font-semibold',day.available?(day.valid?'text-success-strong':'text-rose-700'):'text-muted-foreground')}>{day.available?(day.valid?'Valid':'Invalid'):'Unavailable'}</span>{day.reasons.length?<p className="text-muted-foreground text-xs">{day.reasons.map(attendanceReason).join('; ')}</p>:null}</td></tr>)}</tbody></table></div>{context.days.length===0?<MissionEmpty className="mt-3">No elapsed days in this period.</MissionEmpty>:null}</section>;})}
    <MissionPanel icon={HistoryIcon} title="Retained attendance records"><div className="grid gap-3">{data.records.length===0?<MissionEmpty>No attendance records in this period.</MissionEmpty>:null}{data.records.map(record=><article key={record.id} className="bg-muted/70 grid gap-1.5 rounded-xl px-4 py-3 text-sm"><p className="text-foreground flex flex-wrap items-center gap-x-1 font-semibold"><CalendarCheckIcon className="text-primary mr-1 size-4" aria-hidden="true"/>{record.attendanceDate} - {names.get(record.userId)} - {record.status} - {record.recordState}</p><p className="text-muted-foreground">{record.hoursConfirmed?'Measured':'Legacy measurement needs confirmation'}: attendance {formatHours(record.attendanceHours)} h; off hours {formatHours(record.offHours)} h.</p>{record.recordState!=='withdrawn'?<details className="disclosure mt-1"><summary>Correct with a reason</summary><AttendanceRecordEditor record={record} members={data.members} user={user}/></details>:null}<Link href={`/records/attendance/${record.id}/history`} className="link justify-self-start text-sm">View retained history</Link></article>)}</div></MissionPanel>
   </main>
  </div>
 </MissionPage>;
}
function attendanceReason(reason:string):string {
 const labels:Record<string,string>={attendance_missing:'Attendance missing',legacy_hours_unconfirmed:'Legacy hours need confirmation',effort_hours_invalid:'Task effort needs reconciliation',attendance_hours_invalid:'Attendance hours need reconciliation',attendance_state_hours_incompatible:'Hours do not match the attendance status',effort_exceeds_attendance_capacity:'Effort exceeds regular plus off-hours',history_before_input_baseline:'Earlier input history is unavailable'};
 return labels[reason]??reason;
}
