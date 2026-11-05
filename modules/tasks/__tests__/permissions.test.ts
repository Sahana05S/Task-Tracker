import { describe, expect, it } from 'vitest';

import {
  canManageMissionObservers,
  canManageTaskPeople,
  canManageTasks,
  canMarkMissionDone,
  canReadMissionWork,
  canUpdateTaskOwnFields,
  canWriteMissionFiles,
  isAssignedToTask,
  missionRelationship,
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

// Migrations 117 and 121: Crew (owner, mate, collab are all Crew), reviewer, observer.
const mission = {
  assigneeId: 'owner',
  assigneeIds: ['owner', 'mate', 'collab'],
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

  it('lets every Crew member and managers mark Done (121)', () => {
    expect(canMarkMissionDone(member('collab'), mission)).toBe(true);
    expect(canMarkMissionDone(member('observer'), mission)).toBe(false);
    expect(canMarkMissionDone(member('reviewer'), mission)).toBe(false);
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

  it('lets the managing director, Managers and the Crew choose observers (121)', () => {
    expect(canManageMissionObservers(member('md', 'managing_director'), mission)).toBe(true);
    expect(canManageMissionObservers(member('pe', 'project_engineer'), mission)).toBe(true);
    for (const id of ['owner', 'mate', 'collab']) expect(canManageMissionObservers(member(id), mission)).toBe(true);
    expect(canManageMissionObservers(member('reviewer'), mission)).toBe(false);
    expect(canManageMissionObservers(member('observer'), mission)).toBe(false);
  });

  it('keeps the Crew with the managing director and Managers; no Owner branch (121)', () => {
    expect(canManageTaskPeople(member('md', 'managing_director'), mission)).toBe(true);
    expect(canManageTaskPeople(member('pe', 'project_engineer'), mission)).toBe(true);
    expect(canManageTaskPeople(member('owner'), mission)).toBe(false);
    expect(canManageTaskPeople(member('mate'), mission)).toBe(false);
    expect(canManageTaskPeople(member('md', 'managing_director'), { ...mission, status: 'Done' })).toBe(false);
  });

  it('calls every assignee row Crew', () => {
    for (const id of ['owner', 'mate', 'collab']) expect(missionRelationship(mission, id)).toBe('crew');
    expect(missionRelationship(mission, 'reviewer')).toBe('reviewer');
    expect(missionRelationship(mission, 'observer')).toBe('observer');
    expect(missionRelationship(mission, 'outsider')).toBeNull();
  });
});
