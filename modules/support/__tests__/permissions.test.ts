import { describe, expect, it } from 'vitest';

import {
  canCreateSupportRecord,
  canValidateSupportRecord,
  canManageReportSnapshots,
  canManageSupportRecords,
} from '../internal/permissions';
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

  it('restricts report snapshot writes to the director', () => {
    expect(canManageReportSnapshots('managing_director')).toBe(true);
    expect(canManageReportSnapshots('project_engineer')).toBe(false);
    expect(canManageReportSnapshots('data_manager')).toBe(false);
    expect(canManageReportSnapshots('team_member')).toBe(false);
  });
});

it('requires an active independent administrator for validation', () => {
  const dm = {id:'dm',role:'data_manager' as const,isActive:true};
  expect(canValidateSupportRecord(dm,'author')).toBe(true);
  expect(canValidateSupportRecord(dm,'dm')).toBe(false);
  expect(canValidateSupportRecord({...dm,isActive:false},'author')).toBe(false);
  expect(canValidateSupportRecord({...dm,role:'team_member'},'author')).toBe(false);
});
