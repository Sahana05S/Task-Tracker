import { describe, expect, it } from 'vitest';
import { canViewEmployeeProfile, canViewEmployeeReports, canViewTeamModule } from '@/lib/team/permissions';
import type { UserRole } from '@/types/tracker';
describe('approved employee report visibility', () => {
  it('allows active team summaries and rejects inactive viewers', () => {
    expect(canViewTeamModule({isActive:true})).toBe(true);
    expect(canViewTeamModule({isActive:false})).toBe(false);
  });
  it('allows self and managers, including archived employee reports', () => {
    const roles: UserRole[] = ['managing_director','project_engineer','data_manager','team_member'];
    for (const role of roles) {
      const self = { id:'a',role,isActive:true };
      expect(canViewEmployeeReports(self,{id:'a'})).toBe(true);
      expect(canViewEmployeeProfile(self,{id:'b'})).toBe(role==='managing_director' || role==='project_engineer');
      expect(canViewEmployeeReports({...self,isActive:false},{id:'a'})).toBe(false);
    }
  });
});
