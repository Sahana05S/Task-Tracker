import { TASK_MANAGER_ROLES, type MissionRelationship } from '@/shared/tracker/enums';
import type { Task, User, UserRole } from '@/types/tracker';

export function canManageTasks(role: UserRole): boolean {
  return (TASK_MANAGER_ROLES as readonly UserRole[]).includes(role);
}

/** Any `task_assignees` row: the mission's Crew (migration 121). */
export function isAssignedToTask(
  task: Pick<Task, 'assigneeId' | 'assigneeIds'>,
  userId: string,
): boolean {
  return task.assigneeId === userId || task.assigneeIds.includes(userId);
}

/**
 * Every Crew member logs time and marks the mission Done (5 November 2026,
 * migration 121). Mirrors `taskpulse_private.is_task_worker`.
 */
export function isTaskWorker(
  task: Pick<Task, 'assigneeId' | 'assigneeIds'>,
  userId: string,
): boolean {
  return isAssignedToTask(task, userId);
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

/** The Crew: the managing director and Managers only (migration 121). Observers: see canManageMissionObservers. */
export function canManageTaskPeople(
  user: Pick<User, 'id' | 'role' | 'isActive'>,
  task: Pick<Task, 'archivedEffectiveDate' | 'status'>,
): boolean {
  return user.isActive && !task.archivedEffectiveDate && task.status !== 'Done' && task.status !== 'Discarded'
    && canManageTasks(user.role);
}

/**
 * Observers are chosen by the managing director, Managers and the mission's
 * Crew (5 November 2026, migration 121). Mirrors the add_observer /
 * remove_observer rule of `task_people_command`.
 */
export function canManageMissionObservers(
  user: Pick<User, 'id' | 'role' | 'isActive'>,
  task: Pick<Task, 'assigneeId' | 'assigneeIds' | 'archivedEffectiveDate' | 'status'>,
): boolean {
  return user.isActive && !task.archivedEffectiveDate && task.status !== 'Done' && task.status !== 'Discarded'
    && (canManageTasks(user.role) || isTaskWorker(task, user.id));
}

/**
 * May see the mission's checklist and work (details, links, files, learning,
 * objective reviews): the managing director and the mission's people - Crew,
 * reviewers and observers. Project engineers only
 * when they are one of those (4 November 2026, migration 117). Mirrors
 * `taskpulse_private.can_read_mission_work`.
 */
export function canReadMissionWork(
  user: Pick<User, 'id' | 'role'>,
  task: Pick<Task, 'assigneeId' | 'assigneeIds' | 'reviewerIds' | 'observerIds'>,
): boolean {
  return user.role === 'managing_director' || isAssignedToTask(task, user.id)
    || task.reviewerIds.includes(user.id) || (task.observerIds ?? []).includes(user.id);
}

/** Marks the mission Done: managers and every Crew member (migration 121). */
export function canMarkMissionDone(
  user: Pick<User, 'id' | 'role' | 'isActive'>,
  task: Pick<Task, 'assigneeId' | 'assigneeIds'>,
): boolean {
  return user.isActive && (canManageTasks(user.role) || isTaskWorker(task, user.id));
}

/**
 * Adds or removes proofs and Input / Process / Output documents: the mission's
 * people except observers, and the managing director. Observers only view
 * (migration 117, `taskpulse_private.task_proof_writer`).
 */
export function canWriteMissionFiles(
  user: Pick<User, 'id' | 'role' | 'isActive'>,
  task: Pick<Task, 'assigneeId' | 'assigneeIds' | 'reviewerIds' | 'archivedEffectiveDate'>,
): boolean {
  return user.isActive && !task.archivedEffectiveDate
    && (user.role === 'managing_director' || isAssignedToTask(task, user.id) || task.reviewerIds.includes(user.id));
}

/** The strongest relationship a member has with a mission, or null. */
export function missionRelationship(
  task: Pick<Task, 'assigneeId' | 'assigneeIds' | 'reviewerIds' | 'observerIds'>,
  userId: string,
): MissionRelationship | null {
  if (isAssignedToTask(task, userId)) return 'crew';
  if (task.reviewerIds.includes(userId)) return 'reviewer';
  if ((task.observerIds ?? []).includes(userId)) return 'observer';
  return null;
}
