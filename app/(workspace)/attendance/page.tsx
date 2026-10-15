import Link from 'next/link';
import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { AttendanceRecordEditor } from '@/components/support/attendance-record-editor';
import { requireProfile } from '@/lib/auth/profile';
import { canManageAttendance } from '@/lib/attendance/permissions';
import { getAttendanceModuleData } from '@/lib/attendance/queries';
import { kolkataDate } from '@/lib/tasks/contract';
import { currentPeriod } from '@/lib/analytics/engine';
import { formatHours } from '@/lib/tracker/format';
export default async function AttendancePage() {
 const user=await requireProfile(),period=currentPeriod(new Date(kolkataDate()+'T12:00:00Z')),manager=canManageAttendance(user.role);
 const data=await getAttendanceModuleData({startDate:period.startDate,endDate:period.endDate,viewerId:user.id,canManage:manager});
 const names=new Map(data.members.map(m=>[m.id,m.fullName]));
 return <><WorkspaceHeader title="Attendance" description={`${period.label} - measured attendance, effort and off hours`}/><div className="grid gap-4 px-4 py-4 xl:grid-cols-[24rem_minmax(0,1fr)] lg:px-6"><aside className="soft-card h-fit p-4"><h2 className="font-semibold">Record attendance</h2><AttendanceRecordEditor members={data.members} user={user}/></aside><main className="grid content-start gap-4"><p className="rounded border p-3 text-sm">Each elapsed local day needs measured attendance. Task effort must fit within regular attendance plus separately recorded off-hours. Absent/Leave have zero hours; Holiday/Off Hours have only off-hours. Attendance is a gate, not a score bonus.</p>
 {[...data.inputContexts].map(([id,context])=><section className="soft-card overflow-auto p-4" key={id}><h2 className="font-semibold">{names.get(id)??'Employee'} - period validity: {context.validityAvailable?(context.valid?'Valid':'Invalid'):'Unavailable'}</h2><table className="sheet-grid min-w-[48rem]"><thead><tr><th>Date</th><th>Status</th><th>Regular hours</th><th>Off hours</th><th>Task effort</th><th>Validity</th></tr></thead><tbody>{context.days.map(day=><tr key={day.businessDate}><td>{day.businessDate}</td><td>{day.status??'Missing record'}</td><td>{day.attendanceHours==null?'Unavailable':formatHours(day.attendanceHours)}</td><td>{day.offHours==null?'Unavailable':formatHours(day.offHours)}</td><td>{day.effortHours==null?'Unavailable':formatHours(day.effortHours)}</td><td>{day.available?(day.valid?'Valid':'Invalid'):'Unavailable'}{day.reasons.length?<p>{day.reasons.map(attendanceReason).join('; ')}</p>:null}</td></tr>)}</tbody></table>{context.days.length===0?<p>No elapsed days in this period.</p>:null}</section>)}
 <section className="soft-card grid gap-3 p-4"><h2 className="font-semibold">Retained attendance records</h2>{data.records.map(record=><article key={record.id} className="rounded border p-3"><p>{record.attendanceDate} - {names.get(record.userId)} - {record.status} - {record.recordState}</p><p>{record.hoursConfirmed?'Measured':'Legacy measurement needs confirmation'}: attendance {formatHours(record.attendanceHours)} h; off hours {formatHours(record.offHours)} h.</p>{record.recordState!=='withdrawn'?<details><summary className="cursor-pointer text-primary">Correct with a reason</summary><AttendanceRecordEditor record={record} members={data.members} user={user}/></details>:null}<Link href={`/records/attendance/${record.id}/history`} className="text-primary underline">View retained history</Link></article>)}</section>
 </main></div></>;
}
function attendanceReason(reason:string):string {
 const labels:Record<string,string>={attendance_missing:'Attendance missing',legacy_hours_unconfirmed:'Legacy hours need confirmation',effort_hours_invalid:'Task effort needs reconciliation',attendance_hours_invalid:'Attendance hours need reconciliation',attendance_state_hours_incompatible:'Hours do not match the attendance status',effort_exceeds_attendance_capacity:'Effort exceeds regular plus off-hours',history_before_input_baseline:'Earlier input history is unavailable'};
 return labels[reason]??reason;
}
