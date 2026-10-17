import { describe, expect, it } from 'vitest';

import {
  computeHoursFromCheckTimes,
  defaultHoursForStatus,
  summarizeAttendance,
} from '@/modules/attendance/client';

describe('summarizeAttendance', () => {
  it('summarizes daily attendance records into report totals', () => {
    expect(
      summarizeAttendance([
        { status: 'Present', attendanceHours: 8, offHours: 0 },
        { status: 'Half Day', attendanceHours: 4, offHours: 0 },
        { status: 'Holiday', attendanceHours: 0, offHours: 0 },
        { status: 'Absent', attendanceHours: 0, offHours: 0 },
        { status: 'Leave', attendanceHours: 0, offHours: 0 },
        { status: 'Off Hours', attendanceHours: 0, offHours: 3.5 },
      ]),
    ).toEqual({
      recordCount: 6,
      attendanceHours: 12,
      offHours: 3.5,
      presentDays: 1,
      absentDays: 1,
      halfDays: 1,
      holidays: 1,
      leaveDays: 1,
      offHourDays: 1,
      payableDays: 2.5,
    });
  });
});

describe('defaultHoursForStatus', () => {
  it('applies sensible defaults for day status selection', () => {
    expect(defaultHoursForStatus('Present')).toEqual({
      attendanceHours: 8,
      offHours: 0,
    });
    expect(defaultHoursForStatus('Half Day')).toEqual({
      attendanceHours: 4,
      offHours: 0,
    });
    expect(defaultHoursForStatus('Off Hours')).toEqual({
      attendanceHours: 0,
      offHours: 8,
    });
    expect(defaultHoursForStatus('Absent')).toEqual({
      attendanceHours: 0,
      offHours: 0,
    });
  });
});

describe('computeHoursFromCheckTimes', () => {
  it('computes rounded hours between check-in and check-out', () => {
    expect(
      computeHoursFromCheckTimes(
        new Date('2026-10-02T09:00:00.000Z'),
        new Date('2026-10-02T17:30:00.000Z'),
      ),
    ).toBe(8.5);
  });

  it('returns zero for reversed check times and null when incomplete', () => {
    expect(
      computeHoursFromCheckTimes(
        new Date('2026-10-02T17:30:00.000Z'),
        new Date('2026-10-02T09:00:00.000Z'),
      ),
    ).toBe(0);
    expect(computeHoursFromCheckTimes(null, new Date())).toBeNull();
  });
});
