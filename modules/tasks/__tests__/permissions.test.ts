import { describe, expect, it } from 'vitest';

import {
  canManageTasks,
  canUpdateTaskOwnFields,
  isAssignedToTask,
} from '@/modules/tasks/internal/permissions';

const task = {
  assigneeId: 'primary-user',
  assigneeIds: ['primary-user', 'secondary-user'],
};

describe('task permissions', () => {
  it('allows only leadership roles to manage task assignment/details', () => {
    expect(canManageTasks('managing_director')).toBe(true);
    expect(canManageTasks('project_engineer')).toBe(true);
    expect(canManageTasks('data_manager')).toBe(false);
    expect(canManageTasks('team_member')).toBe(false);
  });

  it('recognizes both primary and secondary assignees', () => {
    expect(isAssignedToTask(task, 'primary-user')).toBe(true);
    expect(isAssignedToTask(task, 'secondary-user')).toBe(true);
    expect(isAssignedToTask(task, 'other-user')).toBe(false);
  });

  it('allows managers or assigned users to update own task fields', () => {
    expect(
      canUpdateTaskOwnFields(
        { id: 'manager', role: 'project_engineer', isActive: true },
        task,
      ),
    ).toBe(true);
    expect(
      canUpdateTaskOwnFields(
        { id: 'secondary-user', role: 'team_member', isActive: true },
        task,
      ),
    ).toBe(true);
    expect(
      canUpdateTaskOwnFields({ id: 'other-user', role: 'team_member', isActive: true }, task),
    ).toBe(false);
  });
});
