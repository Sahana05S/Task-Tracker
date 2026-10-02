import { describe, expect, it } from 'vitest';

import {
  canViewEmployeeProfile,
  canViewEmployeeReports,
  canViewTeamModule,
} from '@/lib/team/permissions';

describe('team access rules', () => {
  it('requires an active viewer for the team module', () => {
    expect(canViewTeamModule({ isActive: true })).toBe(true);
    expect(canViewTeamModule({ isActive: false })).toBe(false);
  });

  it('requires active viewer and active employee for profile/report views', () => {
    expect(
      canViewEmployeeProfile({ isActive: true }, { isActive: true }),
    ).toBe(true);
    expect(
      canViewEmployeeProfile({ isActive: true }, { isActive: false }),
    ).toBe(false);
    expect(
      canViewEmployeeReports({ isActive: false }, { isActive: true }),
    ).toBe(false);
  });
});
