import { AttendanceWorkspace } from '@/modules/attendance/components/attendance-workspace';
import { requireProfile } from '@/shared/session/profile';
import { canManageAttendance, getAttendanceModuleData } from '@/modules/attendance';
import { kolkataDate } from '@/shared/time/kolkata';
import { currentPeriod } from '@/shared/time/period';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Attendance · TaskPulse' };

export default async function AttendancePage() {
 const user=await requireProfile(),period=currentPeriod(new Date(kolkataDate()+'T12:00:00Z')),manager=canManageAttendance(user.role);
 const data=await getAttendanceModuleData({startDate:period.startDate,endDate:period.endDate,viewerId:user.id,canManage:manager});
 return <AttendanceWorkspace user={user} periodLabel={period.label} data={data}/>;
}
