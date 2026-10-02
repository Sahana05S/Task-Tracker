import type { Metadata } from 'next';

import { saveAttendanceRecord } from '@/app/(workspace)/attendance/actions';
import { WorkspaceHeader } from '@/components/layout/workspace-header';
import { Button } from '@/components/ui/button';
import { requireProfile } from '@/lib/auth/profile';
import { canManageAttendance } from '@/lib/attendance/permissions';
import { getAttendanceModuleData } from '@/lib/attendance/queries';
import { currentPeriod } from '@/lib/analytics/engine';
import { ATTENDANCE_STATUSES } from '@/lib/tracker/enums';
import { formatDate, formatNumeric } from '@/lib/tracker/format';
import type { AttendanceRecord, User } from '@/types/tracker';

export const metadata: Metadata = {
  title: 'Attendance · TaskPulse',
};

export default async function AttendancePage() {
  const profile = await requireProfile();
  const canManage = canManageAttendance(profile.role);
  const period = currentPeriod();
  const data = await getAttendanceModuleData({
    startDate: period.startDate,
    endDate: period.endDate,
    viewerId: profile.id,
    canManage,
  });
  const memberNames = new Map(
    data.members.map((member) => [member.id, member.fullName]),
  );

  return (
    <>
      <WorkspaceHeader
        title="Attendance"
        description={`${period.label} · daily presence, leave, holidays, and off-hours`}
      />

      <div className="grid gap-4 px-4 py-4 xl:grid-cols-[24rem_minmax(0,1fr)] lg:px-6">
        <aside className="grid h-fit gap-4">
          <section className="soft-card p-4">
            <h2 className="text-foreground text-sm font-semibold">
              Record attendance
            </h2>
            <AttendanceForm
              members={data.members}
              currentUser={profile}
              canManage={canManage}
            />
          </section>
        </aside>

        <main className="grid gap-4">
          <AttendanceSummaryGrid summaries={data.summaries} />
          <AttendanceTable
            records={data.records}
            memberNames={memberNames}
            canManage={canManage}
          />
        </main>
      </div>
    </>
  );
}

function AttendanceForm({
  members,
  currentUser,
  canManage,
}: {
  members: readonly User[];
  currentUser: User;
  canManage: boolean;
}) {
  return (
    <form action={asFormAction(saveAttendanceRecord)} className="mt-3 grid gap-3">
      {!canManage ? (
        <input type="hidden" name="userId" value={currentUser.id} />
      ) : null}

      {canManage ? (
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-slate-900">Employee</span>
          <select
            name="userId"
            defaultValue={currentUser.id}
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            required
          >
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.fullName} · {member.employeeId}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-900">Date</span>
        <input
          type="date"
          name="attendanceDate"
          defaultValue={new Date().toISOString().slice(0, 10)}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          required
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-900">Status</span>
        <select
          name="status"
          defaultValue="Present"
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          required
        >
          {ATTENDANCE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-slate-900">Check-in</span>
          <input
            type="time"
            name="checkInTime"
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-slate-900">Check-out</span>
          <input
            type="time"
            name="checkOutTime"
            className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-slate-900">Attendance hours</span>
          <input
            type="number"
            name="attendanceHours"
            min={0}
            max={24}
            step="0.25"
            className="border-input bg-background h-9 rounded-md border px-3 text-sm tabular"
            placeholder="Auto"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-slate-900">Off-hours</span>
          <input
            type="number"
            name="offHours"
            min={0}
            max={24}
            step="0.25"
            className="border-input bg-background h-9 rounded-md border px-3 text-sm tabular"
            placeholder="Auto"
          />
        </label>
      </div>

      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-900">Holiday name</span>
        <input
          name="holidayName"
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
          placeholder="Optional"
        />
      </label>

      <label className="grid gap-1 text-sm">
        <span className="font-medium text-slate-900">Notes</span>
        <textarea
          name="notes"
          className="border-input bg-background min-h-20 rounded-md border px-3 py-2 text-sm"
          placeholder="Optional attendance note"
        />
      </label>

      <Button type="submit" size="sm">
        Save attendance
      </Button>
    </form>
  );
}

function AttendanceSummaryGrid({
  summaries,
}: {
  summaries: readonly {
    readonly user: User;
    readonly attendanceHours: number;
    readonly offHours: number;
    readonly payableDays: number;
    readonly absentDays: number;
    readonly leaveDays: number;
  }[];
}) {
  if (summaries.length === 0) {
    return (
      <section className="soft-card p-4 text-sm text-slate-500">
        No active employees found.
      </section>
    );
  }

  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {summaries.map((summary) => (
        <div key={summary.user.id} className="metric-card">
          <p className="text-muted-foreground text-[11px] font-medium">
            {summary.user.fullName}
          </p>
          <p className="stat-figure">{formatNumeric(summary.attendanceHours)}h</p>
          <p className="metric-trend">
            {formatNumeric(summary.payableDays)} payable days ·{' '}
            {formatNumeric(summary.offHours)} off-hours ·{' '}
            {summary.absentDays + summary.leaveDays} away
          </p>
        </div>
      ))}
    </section>
  );
}

function AttendanceTable({
  records,
  memberNames,
  canManage,
}: {
  records: readonly AttendanceRecord[];
  memberNames: ReadonlyMap<string, string>;
  canManage: boolean;
}) {
  if (records.length === 0) {
    return (
      <section className="soft-card p-6 text-sm text-slate-500">
        No attendance records have been added for this period.
      </section>
    );
  }

  return (
    <section className="soft-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="sheet-grid min-w-[56rem]">
          <thead>
            <tr>
              <th>Date</th>
              {canManage ? <th>Employee</th> : null}
              <th>Status</th>
              <th>Check-in</th>
              <th>Check-out</th>
              <th className="text-right">Attendance h</th>
              <th className="text-right">Off h</th>
              <th>Holiday</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id}>
                <td className="text-xs whitespace-nowrap">
                  {formatDate(record.attendanceDate)}
                </td>
                {canManage ? (
                  <td className="text-xs">
                    {memberNames.get(record.userId) ?? 'Unknown'}
                  </td>
                ) : null}
                <td className="text-xs">{record.status}</td>
                <td className="text-xs">{formatTime(record.checkInAt)}</td>
                <td className="text-xs">{formatTime(record.checkOutAt)}</td>
                <td className="sheet-numeric text-xs">
                  {formatNumeric(record.attendanceHours)}
                </td>
                <td className="sheet-numeric text-xs">
                  {formatNumeric(record.offHours)}
                </td>
                <td className="text-xs">{record.holidayName ?? '—'}</td>
                <td className="max-w-72 text-xs">{record.notes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatTime(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

type ServerFormAction = (formData: FormData) => void | Promise<void>;

function asFormAction(
  action: (formData: FormData) => Promise<unknown>,
): ServerFormAction {
  return action as ServerFormAction;
}
