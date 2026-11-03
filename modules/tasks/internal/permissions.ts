import { TASK_MANAGER_ROLES, type MissionRelationship } from '@/shared/tracker/enums';
import type { Task, User, UserRole } from '@/types/tracker';

export function canManageTasks(role: UserRole): boolean {
  return (TASK_MANAGER_ROLES as readonly UserRole[]).includes(role);
}

/** Any `task_assignees` row: the owner, assignees and collaborators. */
export function isAssignedToTask(
  task: Pick<Task, 'assigneeId' | 'assigneeIds'>,
  userId: string,
): boolean {
  return task.assigneeId === userId || task.assigneeIds.includes(userId);
}

/**
 * Assigned with a share, so they log time (D-A3, migration 108). Collaborators
 * are assigned but are not workers. Mirrors `taskpulse_private.is_task_worker`.
 */
export function isTaskWorker(
  task: Pick<Task, 'assigneeId' | 'assigneeIds' | 'collaboratorIds'>,
  userId: string,
): boolean {
  return isAssignedToTask(task, userId) && !(task.collaboratorIds ?? []).includes(userId);
}

export function canUpdateTaskOwnFields(
  user: Pick<User, 'id' | 'role' | 'isActive'>,
  task: Pick<Task, 'assigneeId' | 'assigneeIds' | 'archivedEffectiveDate'>,
): boolean {
  return !task.archivedEffectiveDate && user.isActive && (canManageTasks(user.role) || isAssignedToTask(task, user.id));
}

/** Details (sections, relations, link labels): managers and the mission's people (D-A2). */
export function canEditTaskDetails(
  user: Pick<User, 'id' | 'role' | 'isActive'>,
  task: Pick<Task, 'assigneeId' | 'assigneeIds' | 'archivedEffectiveDate'>,
): boolean {
  return canUpdateTaskOwnFields(user, task);
}

/** Collaborators, observers and ownership: managers and the current Owner (D-A4). */
export function canManageTaskPeople(
  user: Pick<User, 'id' | 'role' | 'isActive'>,
  task: Pick<Task, 'assigneeId' | 'archivedEffectiveDate' | 'status'>,
): boolean {
  return user.isActive && !task.archivedEffectiveDate && task.status !== 'Done' && task.status !== 'Discarded'
    && (canManageTasks(user.role) || task.assigneeId === user.id);
}

/** The strongest relationship a member has with a mission, or null. */
export function missionRelationship(
  task: Pick<Task, 'assigneeId' | 'assigneeIds' | 'collaboratorIds' | 'reviewerIds' | 'observerIds'>,
  userId: string,
): MissionRelationship | null {
  if (task.assigneeId === userId) return 'owner';
  if (isTaskWorker(task, userId)) return 'assignee';
  if (isAssignedToTask(task, userId)) return 'collaborator';
  if (task.reviewerIds.includes(userId)) return 'reviewer';
  if ((task.observerIds ?? []).includes(userId)) return 'observer';
  return null;
}
