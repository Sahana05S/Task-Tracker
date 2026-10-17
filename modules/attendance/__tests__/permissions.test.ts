import { describe, expect, it } from 'vitest';

import {
  canEditAttendanceRecord,
  canManageAttendance,
} from '@/modules/attendance/client';

describe('attendance permissions', () => {
  it('allows only task manager roles to manage team attendance', () => {
    expect(canManageAttendance('managing_director')).toBe(true);
    expect(canManageAttendance('project_engineer')).toBe(true);
    expect(canManageAttendance('data_manager')).toBe(false);
    expect(canManageAttendance('team_member')).toBe(false);
  });

  it('allows users to edit their own records and managers to edit all', () => {
    expect(
      canEditAttendanceRecord(
        { id: 'user-1', role: 'team_member', isActive: true },
        { userId: 'user-1' },
      ),
    ).toBe(true);
    expect(
      canEditAttendanceRecord(
        { id: 'manager', role: 'project_engineer', isActive: true },
        { userId: 'user-1' },
      ),
    ).toBe(true);
    expect(
      canEditAttendanceRecord(
        { id: 'user-2', role: 'team_member', isActive: true },
        { userId: 'user-1' },
      ),
    ).toBe(false);
  });
});
