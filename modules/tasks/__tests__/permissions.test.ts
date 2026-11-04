import { describe, expect, it } from 'vitest';

import {
  canManageMissionObservers,
  canManageTasks,
  canMarkMissionDone,
  canReadMissionWork,
  canUpdateTaskOwnFields,
  canWriteMissionFiles,
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

// 4 November 2026 (migration 117): owner, assignee, collaborator, reviewer, observer.
const mission = {
  assigneeId: 'owner',
  assigneeIds: ['owner', 'mate', 'collab'],
  collaboratorIds: ['collab'],
  reviewerIds: ['reviewer'],
  observerIds: ['observer'],
  archivedEffectiveDate: null,
  status: 'In Progress' as const,
};
const member = (id: string, role: 'managing_director' | 'project_engineer' | 'team_member' = 'team_member') => ({ id, role, isActive: true });

describe('mission work visibility and role tightenings', () => {
  it('lets only the managing director and the mission\'s people read its checklist', () => {
    for (const id of ['owner', 'mate', 'collab', 'reviewer', 'observer']) expect(canReadMissionWork(member(id), mission)).toBe(true);
    expect(canReadMissionWork(member('md', 'managing_director'), mission)).toBe(true);
    expect(canReadMissionWork(member('pe', 'project_engineer'), mission)).toBe(false);
    expect(canReadMissionWork(member('pe', 'project_engineer'), { ...mission, observerIds: ['pe'] })).toBe(true);
    expect(canReadMissionWork(member('outsider'), mission)).toBe(false);
  });

  it('keeps Done from collaborators only', () => {
    expect(canMarkMissionDone(member('collab'), mission)).toBe(false);
    expect(canMarkMissionDone(member('owner'), mission)).toBe(true);
    expect(canMarkMissionDone(member('mate'), mission)).toBe(true);
    expect(canMarkMissionDone(member('pe', 'project_engineer'), mission)).toBe(true);
  });

  it('makes observers view-only for files', () => {
    expect(canWriteMissionFiles(member('observer'), mission)).toBe(false);
    for (const id of ['owner', 'mate', 'collab', 'reviewer']) expect(canWriteMissionFiles(member(id), mission)).toBe(true);
    expect(canWriteMissionFiles(member('md', 'managing_director'), mission)).toBe(true);
    expect(canWriteMissionFiles(member('pe', 'project_engineer'), mission)).toBe(false);
  });

  it('lets the managing director, the owner and assignees choose observers', () => {
    expect(canManageMissionObservers(member('md', 'managing_director'), mission)).toBe(true);
    expect(canManageMissionObservers(member('owner'), mission)).toBe(true);
    expect(canManageMissionObservers(member('mate'), mission)).toBe(true);
    expect(canManageMissionObservers(member('collab'), mission)).toBe(false);
    expect(canManageMissionObservers(member('reviewer'), mission)).toBe(false);
    expect(canManageMissionObservers(member('pe', 'project_engineer'), mission)).toBe(false);
  });
});
