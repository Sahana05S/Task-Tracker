import { describe, expect, it } from 'vitest';

import {
  canCreateSupportRecord,
  canManageReportSnapshots,
  canManageSupportRecords,
} from '@/lib/support/permissions';
import type { UserRole } from '@/types/tracker';

describe('support permissions', () => {
  it('lets active users create support records', () => {
    expect(canCreateSupportRecord({ isActive: true })).toBe(true);
    expect(canCreateSupportRecord({ isActive: false })).toBe(false);
  });

  it('lets leadership and data managers manage support records', () => {
    const allowed: UserRole[] = [
      'managing_director',
      'project_engineer',
      'data_manager',
    ];
    const denied: UserRole[] = ['team_member'];

    for (const role of allowed) {
      expect(canManageSupportRecords(role)).toBe(true);
    }
    for (const role of denied) {
      expect(canManageSupportRecords(role)).toBe(false);
    }
  });

  it('restricts report snapshots to leadership roles', () => {
    expect(canManageReportSnapshots('managing_director')).toBe(true);
    expect(canManageReportSnapshots('project_engineer')).toBe(true);
    expect(canManageReportSnapshots('data_manager')).toBe(false);
    expect(canManageReportSnapshots('team_member')).toBe(false);
  });
});
