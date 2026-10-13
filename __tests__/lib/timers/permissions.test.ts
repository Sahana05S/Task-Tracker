import { describe, expect, it } from 'vitest';

import {
  canManageTimerRecord,
  canStartTimerForTask,
} from '@/lib/timers/permissions';

const task = {
  assigneeId: 'primary-user',
  assigneeIds: ['primary-user', 'support-user'],
  status: 'In Progress' as const,
};

describe('timer permissions', () => {
  it('allows assignees and managers to start timers on active tasks', () => {
    expect(
      canStartTimerForTask({ id: 'support-user', role: 'team_member', isActive: true }, task),
    ).toBe(true);
    expect(
      canStartTimerForTask(
        { id: 'manager', role: 'project_engineer', isActive: true },
        task,
      ),
    ).toBe(true);
  });

  it('blocks unrelated users and terminal tasks', () => {
    expect(
      canStartTimerForTask({ id: 'other-user', role: 'team_member', isActive: true }, task),
    ).toBe(false);
    expect(
      canStartTimerForTask(
        { id: 'support-user', role: 'team_member', isActive: true },
        { ...task, status: 'Done' },
      ),
    ).toBe(false);
    expect(
      canStartTimerForTask(
        { id: 'support-user', role: 'team_member', isActive: true },
        { ...task, status: 'Discarded' },
      ),
    ).toBe(false);
  });

  it('allows users to manage their own timer records and managers to manage all', () => {
    expect(
      canManageTimerRecord(
        { id: 'timer-owner', role: 'team_member', isActive: true },
        { userId: 'timer-owner' },
      ),
    ).toBe(true);
    expect(
      canManageTimerRecord(
        { id: 'manager', role: 'managing_director', isActive: true },
        { userId: 'timer-owner' },
      ),
    ).toBe(true);
    expect(
      canManageTimerRecord(
        { id: 'other-user', role: 'team_member', isActive: true },
        { userId: 'timer-owner' },
      ),
    ).toBe(false);
  });
});
