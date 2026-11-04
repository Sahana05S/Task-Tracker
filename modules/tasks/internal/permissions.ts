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

/** Collaborators and ownership: managers and the current Owner (D-A4). Observers: see canManageMissionObservers. */
export function canManageTaskPeople(
  user: Pick<User, 'id' | 'role' | 'isActive'>,
  task: Pick<Task, 'assigneeId' | 'archivedEffectiveDate' | 'status'>,
): boolean {
  return user.isActive && !task.archivedEffectiveDate && task.status !== 'Done' && task.status !== 'Discarded'
    && (canManageTasks(user.role) || task.assigneeId === user.id);
}

/**
 * Observers are chosen by the managing director, the Owner and the mission's
 * credited assignees (4 November 2026, migration 117). Mirrors the
 * add_observer / remove_observer rule of `task_people_command`.
 */
export function canManageMissionObservers(
  user: Pick<User, 'id' | 'role' | 'isActive'>,
  task: Pick<Task, 'assigneeId' | 'assigneeIds' | 'collaboratorIds' | 'archivedEffectiveDate' | 'status'>,
): boolean {
  return user.isActive && !task.archivedEffectiveDate && task.status !== 'Done' && task.status !== 'Discarded'
    && (user.role === 'managing_director' || task.assigneeId === user.id || isTaskWorker(task, user.id));
}

/**
 * May see the mission's checklist and work (details, links, files, learning,
 * objective reviews): the managing director and the mission's people - Owner,
 * assignees, collaborators, reviewers and observers. Project engineers only
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

/**
 * Marks the mission Done: managers, the Owner and credited assignees. Collaborators
 * keep every other edit but not this one (migration 117).
 */
export function canMarkMissionDone(
  user: Pick<User, 'id' | 'role' | 'isActive'>,
  task: Pick<Task, 'assigneeId' | 'assigneeIds' | 'collaboratorIds'>,
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
