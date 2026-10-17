import { loadAttendanceContext, type AttendanceInputContext } from '@/modules/support';
import {
  ATTENDANCE_COLUMNS,
  mapAttendanceRecords,
} from './mappers';
import { summarizeAttendance } from './summary';
import { mapUser, USER_COLUMNS } from '@/shared/supabase/mappers';
import { createClient } from '@/shared/supabase/server';
import { observationInstant } from '@/lib/presentation/clock';
import type { AttendanceRecord, User } from '@/types/tracker';

export interface AttendanceModuleData {
  readonly inputContexts: ReadonlyMap<string,AttendanceInputContext>;
  readonly members: readonly User[];
  readonly records: readonly AttendanceRecord[];
  readonly summaries: readonly AttendanceMemberSummary[];
}

export interface AttendanceMemberSummary {
  readonly user: User;
  readonly recordCount: number;
  readonly attendanceHours: number;
  readonly offHours: number;
  readonly payableDays: number;
  readonly absentDays: number;
  readonly leaveDays: number;
}

export async function getAttendanceModuleData({
  startDate,
  endDate,
  viewerId,
  canManage,
}: {
  readonly startDate: string;
  readonly endDate: string;
  readonly viewerId: string;
  readonly canManage: boolean;
}): Promise<AttendanceModuleData> {
  const supabase = await createClient();

  const [memberResult, attendanceResult] = await Promise.all([
    supabase.from('users').select(USER_COLUMNS).order('full_name'),
    buildAttendanceQuery(supabase, startDate, endDate, viewerId, canManage),
  ]);

  if (memberResult.error) {
    throw new Error(`Failed to load members: ${memberResult.error.message}`);
  }
  if (attendanceResult.error) {
    throw new Error(
      `Failed to load attendance: ${attendanceResult.error.message}`,
    );
  }

  const members = memberResult.data.map(mapUser);
  const visibleMembers = canManage
    ? members
    : members.filter((member) => member.id === viewerId);
  const records = mapAttendanceRecords(attendanceResult.data);
  const recordsByUser = new Map<string, AttendanceRecord[]>();

  for (const record of records) {
    const entries = recordsByUser.get(record.userId) ?? [];
    entries.push(record);
    recordsByUser.set(record.userId, entries);
  }

  const exclusive=new Date(`${endDate}T00:00:00Z`);exclusive.setUTCDate(exclusive.getUTCDate()+1);
  // The input context rejects a future as-of; observe at the database clock.
  const asOf=(await observationInstant(supabase)).instant.toISOString();
  const inputContexts=new Map(await Promise.all(visibleMembers.map(async u=>[u.id,await loadAttendanceContext(supabase,u.id,startDate,exclusive.toISOString().slice(0,10),asOf)] as const)));
  return {
    inputContexts,
    members: visibleMembers,
    records,
    summaries: visibleMembers.map((user) => {
      const summary = summarizeAttendance(recordsByUser.get(user.id) ?? []);

      return {
        user,
        recordCount: summary.recordCount,
        attendanceHours: summary.attendanceHours,
        offHours: summary.offHours,
        payableDays: summary.payableDays,
        absentDays: summary.absentDays,
        leaveDays: summary.leaveDays,
      };
    }),
  };
}

function buildAttendanceQuery(
  supabase: Awaited<ReturnType<typeof createClient>>,
  startDate: string,
  endDate: string,
  viewerId: string,
  canManage: boolean,
) {
  let query = supabase
    .from('attendance_records')
    .select(ATTENDANCE_COLUMNS)
    .gte('attendance_date', startDate)
    .lte('attendance_date', endDate)
    .order('attendance_date', { ascending: false });

  if (!canManage) {
    query = query.eq('user_id', viewerId);
  }

  return query;
}
