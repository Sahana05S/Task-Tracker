import { describe, expect, it } from 'vitest';

import {
  attendanceMatrix,
  attendanceMonth,
  cellCommand,
  cellValues,
  emptyCells,
  fillCommand,
  hoursBetween,
  monthDates,
  withStatus,
} from '@/modules/attendance/client';
import type { AttendanceInputContext } from '@/modules/support/client';
import type { AttendanceRecord } from '@/types/tracker';

const ravi = { id: '11111111-1111-4111-8111-111111111111', fullName: 'Ravi', employeeId: 'E1', isActive: true };
const meena = { id: '22222222-2222-4222-8222-222222222222', fullName: 'Meena', employeeId: 'E2', isActive: true };
const gone = { id: '33333333-3333-4333-8333-333333333333', fullName: 'Former', employeeId: 'E3', isActive: false };

const record = (over: Partial<AttendanceRecord>): AttendanceRecord => ({
  id: 'rec-1', userId: ravi.id, attendanceDate: '2026-10-01', status: 'Present', checkInAt: '2026-10-01T03:30:00.000Z', checkOutAt: '2026-10-01T12:00:00.000Z',
  attendanceHours: 8, offHours: 0, holidayName: null, notes: null, recordedBy: null, createdAt: '', updatedAt: '', recordVersion: 3, hoursConfirmed: true, recordState: 'active', ...over,
});

const context = (userId: string, days: AttendanceInputContext['days']) => ({ userId, days } as unknown as AttendanceInputContext);

function model() {
  return attendanceMatrix({
    month: '2026-10',
    today: '2026-10-03',
    members: [ravi, meena, gone],
    records: [
      record({}),
      record({ id: 'rec-2', attendanceDate: '2026-10-02', status: 'Holiday', attendanceHours: 0, offHours: 0, holidayName: 'Gandhi Jayanti', checkInAt: null, checkOutAt: null }),
      record({ id: 'rec-3', userId: meena.id, attendanceDate: '2026-10-02', recordState: 'withdrawn' }),
    ],
    contexts: new Map([[ravi.id, context(ravi.id, [
      { businessDate: '2026-10-01', available: true, valid: false, effortHours: '9.5', reasons: ['effort_exceeds_attendance_capacity'] } as AttendanceInputContext['days'][number],
    ])]]),
  });
}

describe('attendance matrix', () => {
  it('lays out every day of the month and marks today and future days', () => {
    expect(monthDates('2026-02')).toHaveLength(28);
    const m = model();
    expect(m.days).toHaveLength(31);
    expect(m.days.slice(1, 4).map(d => d.kind)).toEqual(['past', 'today', 'future']);
    expect(m.days[3]).toMatchObject({ weekday: 'Sun', weekend: true });
  });

  it('shows active members and leaves out inactive ones without records', () => {
    expect(model().rows.map(r => r.member.fullName)).toEqual(['Ravi', 'Meena']);
  });

  it('fills cells from records, check times and the daily check', () => {
    const [first, second, third] = model().rows[0].cells;
    expect(first).toMatchObject({ status: 'Present', attendanceHours: 8, checkIn: '09:00', checkOut: '17:30', check: 'fails', effortHours: 9.5, version: 3 });
    expect(second).toMatchObject({ status: 'Holiday', holidayName: 'Gandhi Jayanti', check: null });
    expect(third).toMatchObject({ status: null, kind: 'today', recordId: null });
    expect(model().rows[0].missing).toBe(0);
  });

  it('treats a withdrawn record as not recorded but still occupied', () => {
    const cell = model().rows[1].cells[1];
    expect(cell).toMatchObject({ status: null, withdrawn: true, recordId: 'rec-3' });
    expect(model().rows[1].missing).toBe(2);
  });
});

describe('attendance month', () => {
  it('defaults to this month and refuses future or malformed months', () => {
    expect(attendanceMonth(undefined, '2026-10-22')).toMatchObject({ previous: '2026-09', next: null, error: null });
    expect(attendanceMonth('2026-09', '2026-10-22')).toMatchObject({ next: '2026-10', error: null });
    expect(attendanceMonth('2026-09', '2026-10-22').period.label).toBe('September 2026');
    expect(attendanceMonth('2026-12', '2026-10-22').error).toMatch(/not started/);
    expect(attendanceMonth('2026-13', '2026-10-22').error).toMatch(/could not be read/);
    expect(attendanceMonth('2026-01', '2026-10-22').previous).toBe('2025-12');
  });
});

describe('editing payload', () => {
  it('records a new day at version zero with no reason', () => {
    const cell = model().rows[0].cells[2];
    const values = cellValues(cell);
    expect(values).toMatchObject({ status: 'Present', attendanceHours: '8', offHours: '0' });
    expect(cellCommand(ravi.id, cell, { ...values, checkIn: '09:15', checkOut: '17:15', notes: ' site visit ' })).toEqual({
      kind: 'attendance', command: 'save', recordId: '', expectedVersion: '0', author_id: ravi.id, business_date: '2026-10-03',
      attendance_status: 'Present', attendance_hours: '8', off_hours: '0', check_in_time: '09:15', check_out_time: '17:15',
      holiday_name: '', content: 'site visit', reason: '',
    });
  });

  it('corrects an existing record at its version with the reason', () => {
    const cell = model().rows[0].cells[0];
    const payload = cellCommand(ravi.id, cell, { ...withStatus(cellValues(cell), 'Half Day'), reason: 'Left at noon' });
    expect(payload).toMatchObject({ recordId: 'rec-1', expectedVersion: '3', attendance_status: 'Half Day', attendance_hours: '4', reason: 'Left at noon' });
  });

  it('corrects a withdrawn record instead of creating a second one', () => {
    const cell = model().rows[1].cells[1];
    expect(cellCommand(meena.id, cell, { ...cellValues(cell), reason: 'Was present' })).toMatchObject({ recordId: 'rec-3', expectedVersion: '3' });
  });

  it('uses the usual 8 / 4 hours and zero regular hours for other statuses', () => {
    const base = cellValues(model().rows[0].cells[2]);
    expect(withStatus(base, 'Half Day')).toMatchObject({ attendanceHours: '4', offHours: '0' });
    expect(withStatus({ ...base, offHours: '2' }, 'Holiday')).toMatchObject({ attendanceHours: '0', offHours: '2' });
    expect(withStatus({ ...base, offHours: '2' }, 'Leave')).toMatchObject({ attendanceHours: '0', offHours: '0' });
    expect(withStatus(base, 'Off Hours')).toMatchObject({ attendanceHours: '0', offHours: '8' });
  });

  it('sends a holiday name only for a holiday', () => {
    const cell = model().rows[0].cells[2];
    expect(cellCommand(ravi.id, cell, { ...cellValues(cell), holidayName: 'Diwali' }).holiday_name).toBe('');
    expect(cellCommand(ravi.id, cell, { ...withStatus(cellValues(cell), 'Holiday'), holidayName: ' Diwali ' }).holiday_name).toBe('Diwali');
  });

  it('works out hours from a forward pair of check times', () => {
    expect(hoursBetween('09:00', '17:30')).toBe(8.5);
    expect(hoursBetween('09:10', '13:00')).toBe(3.83);
    expect(hoursBetween('17:00', '09:00')).toBeNull();
    expect(hoursBetween('', '09:00')).toBeNull();
  });
});

describe('fill a day', () => {
  it('targets only members with no record that day', () => {
    expect(emptyCells(model(), '2026-10-02')).toEqual([]);
    expect(emptyCells(model(), '2026-10-01')).toEqual([meena.id]);
  });

  it('creates holidays and usual-hour days as new records', () => {
    expect(fillCommand(meena.id, '2026-10-01', 'Holiday', 'Diwali')).toMatchObject({ recordId: '', expectedVersion: '0', attendance_status: 'Holiday', attendance_hours: '0', off_hours: '0', holiday_name: 'Diwali', reason: '' });
    expect(fillCommand(meena.id, '2026-10-01', 'Present', '')).toMatchObject({ attendance_status: 'Present', attendance_hours: '8', holiday_name: '' });
    expect(fillCommand(meena.id, '2026-10-01', 'Half Day', '')).toMatchObject({ attendance_hours: '4' });
  });
});
