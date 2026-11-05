import { describe, expect, it } from 'vitest';

import { ASSIGNABLE_ROLES, ROLE_LABELS, TASK_MANAGER_ROLES, USER_ROLES } from '../enums';

describe('roles (5 Nov 2026: Managing Director, Manager, Team Member)', () => {
  it('labels the internal project_engineer code as Manager', () => {
    expect(ROLE_LABELS.project_engineer).toBe('Manager');
    expect(Object.values(ROLE_LABELS).join(' ')).not.toMatch(/engineer/i);
  });

  it('offers only the three roles; Data Manager stays parseable but is never given', () => {
    expect(ASSIGNABLE_ROLES.map(role => ROLE_LABELS[role])).toEqual(['Managing Director', 'Manager', 'Team Member']);
    expect(ASSIGNABLE_ROLES).not.toContain('data_manager');
    expect(USER_ROLES).toContain('data_manager');
  });

  it('keeps the Manager powers on the internal code', () => {
    expect(TASK_MANAGER_ROLES).toEqual(['managing_director', 'project_engineer']);
  });
});
