import type { Metadata } from 'next';

import { AttendanceWorkspace } from '@/modules/attendance/components/attendance-workspace';
import { attendanceMatrix, attendanceMonth, canEditAttendanceRecord, canManageAttendance, getAttendanceModuleData } from '@/modules/attendance';
import { requireProfile } from '@/shared/session/profile';
import { kolkataDate } from '@/shared/time/kolkata';

export const metadata: Metadata = { title: 'Attendance' };

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireProfile();
  const today = kolkataDate();
  const { period, previous, next, error } = attendanceMonth((await searchParams).month, today);
  const manager = canManageAttendance(user.role);
  const data = await getAttendanceModuleData({ startDate: period.startDate, endDate: period.endDate, viewerId: user.id, canManage: manager });
  const model = attendanceMatrix({ month: period.startDate.slice(0, 7), today, members: data.members, records: data.records, contexts: data.inputContexts });
  const editable = model.rows.filter(row => row.member.isActive && canEditAttendanceRecord(user, { userId: row.member.id })).map(row => row.member.id);
  return <AttendanceWorkspace model={model} periodLabel={period.label} previous={previous} next={next} editable={editable} canFill={user.isActive && manager} monthError={error} />;
}
