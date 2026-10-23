'use server';

import {
  revalidateAfterCreate,
  revalidateAfterEdit,
  revalidateAfterLifecycle,
} from '@/modules/tasks/internal/cache';
import {
  createTaskWithScale,
  deleteTaskRow,
  findTaskIdByTag,
  runLifecycleCommand,
  saveTaskWithParticipants,
} from '@/modules/tasks/internal/commands';
import {
  buildScalePayload,
  isValidCommandTarget,
  missingScaleInput,
  parseNewMissionScale,
  parseTaskFields,
  readParticipantVersion,
} from '@/modules/tasks/internal/input';
import { canManageTasks } from '@/modules/tasks/internal/permissions';
import { commandIdentity } from '@/shared/commands/result';
import { readString } from '@/shared/forms/form-data';
import { resolveActor } from '@/shared/session/actor';
import { isTaskStatus } from '@/shared/tracker/enums';
import type { Json } from '@/types/database';
import type { ActionResponse, TaskStatus } from '@/types/tracker';

/**
 * PUBLIC task Server Actions.
 *
 * Each one: resolve the caller -> check the role -> parse input -> run the
 * command -> refresh the pages. The checks here give a meaningful message; RLS
 * and the RPCs are the real boundary.
 *
 * Division of rights:
 *   managing_director, project_engineer   create, fully edit, delete any task
 *   assignee                              status and progress on their own tasks
 */

export type TaskActionState = ActionResponse<{ taskId: string }>;

const failure = (error: string): TaskActionState => ({ success: false, error });

/* Create and edit --------------------------------------------------------- */

export async function createTask(_prevState: TaskActionState | null, formData: FormData): Promise<TaskActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return failure(actor.error);
  if (!canManageTasks(actor.profile.role)) {
    return failure('Only managing directors and project engineers can create tasks.');
  }

  const fields = parseTaskFields(formData);
  if (!fields.ok) return failure(fields.error);
  const scale = parseNewMissionScale(formData);
  if (!scale.ok) return failure(scale.error);

  const shared = {
    extraFields: {
      description: readString(formData, 'description') || null,
      template_version_id: readString(formData, 'templateVersionId') || null,
      initialize_details: readString(formData, 'initializationMode') !== 'manual',
    },
    acceptLegacyShares: formData.get('acceptLegacyShares') === 'on',
    operationId: readString(formData, 'operationId'),
  };
  // A fixed weight is the plain save; a formula scale is applied in the same transaction.
  const saved =
    scale.value.mode === 'manual'
      ? await saveTaskWithParticipants(fields.value, {
          ...shared,
          taskId: null,
          extraFields: { ...shared.extraFields, task_scale: fields.value.taskScale },
          expectedVersion: null,
        })
      : await createTaskWithScale(fields.value, shared, scale.value);
  if (!saved.ok) return failure(saved.error);

  revalidateAfterCreate();
  return { success: true, data: { taskId: saved.value } };
}

export async function updateTask(_prevState: TaskActionState | null, formData: FormData): Promise<TaskActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return failure(actor.error);
  if (!canManageTasks(actor.profile.role)) {
    return failure('Only managing directors and project engineers can edit task details.');
  }

  const version = readParticipantVersion(formData);
  if (version === null) return failure('Reload the task before editing its participants.');
  const taskId = readString(formData, 'taskId');
  if (taskId === '') return failure('Missing task reference.');

  const fields = parseTaskFields(formData);
  if (!fields.ok) return failure(fields.error);

  const saved = await saveTaskWithParticipants(fields.value, {
    taskId,
    extraFields: { expected_lifecycle_version: Number(readString(formData, 'lifecycleVersion')) },
    expectedVersion: version,
    acceptLegacyShares: formData.get('acceptLegacyShares') === 'on',
    operationId: readString(formData, 'operationId'),
  });
  if (!saved.ok) return failure(saved.error);

  revalidateAfterEdit();
  return { success: true, data: { taskId } };
}

/* Lifecycle: status, progress, scale, review ------------------------------ */

/** Sends one lifecycle command for the signed-in caller. */
async function taskCommand(
  taskId: string,
  command: string,
  payload: Json,
  version: number | undefined,
  operationId: string | undefined,
): Promise<TaskActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return failure(actor.error);
  if (!isValidCommandTarget(taskId, version, operationId)) {
    return failure('Reload the task before submitting this change.');
  }

  const refused = await runLifecycleCommand(taskId, command, payload, version!, operationId!);
  if (refused) return refused;

  revalidateAfterLifecycle();
  return { success: true, data: { taskId } };
}

export async function updateTaskStatus(
  taskId: string,
  status: TaskStatus,
  version?: number,
  operationId?: string,
  reason?: string,
): Promise<TaskActionState> {
  if (!isTaskStatus(status)) return failure('Unrecognised status.');
  return taskCommand(taskId, 'transition', { status, reason: reason ?? null }, version, operationId);
}

export async function updateTaskProgress(
  taskId: string,
  progressPercentage: number,
  version?: number,
  operationId?: string,
): Promise<TaskActionState> {
  return taskCommand(taskId, 'progress', { progress: progressPercentage }, version, operationId);
}

/** Builds the scale payload, resolving a linked source task tag to its id. */
async function scalePayload(formData: FormData): Promise<{ ok: true; value: Json } | { ok: false; error: string }> {
  const missing = missingScaleInput(formData);
  if (missing) return { ok: false, error: missing };

  let sourceId = readString(formData, 'sourceTaskId');
  if (readString(formData, 'mode') === 'linked' && !sourceId) {
    const found = await findTaskIdByTag(readString(formData, 'sourceTaskTag'));
    if (!found) return { ok: false, error: 'Source task tag was not found.' };
    sourceId = found;
  }
  return buildScalePayload(formData, sourceId);
}

export async function changeTaskLifecycle(_previous: TaskActionState | null, formData: FormData): Promise<TaskActionState> {
  const identity = commandIdentity(formData);
  const command = readString(formData, 'command');
  if (!identity.operationId || identity.version === null || !['transition', 'scale', 'review'].includes(command)) {
    return failure('Invalid task command; reload and retry.');
  }

  let payload: Json;
  if (command === 'transition') {
    payload = { status: readString(formData, 'status'), reason: readString(formData, 'reason') };
  } else if (command === 'review') {
    payload = { approved: readString(formData, 'approved') === 'true' };
  } else {
    const scale = await scalePayload(formData);
    if (!scale.ok) return failure(scale.error);
    payload = scale.value;
  }

  return taskCommand(readString(formData, 'taskId'), command, payload, identity.version, identity.operationId);
}

export async function recordTaskReview(previous: TaskActionState | null, formData: FormData): Promise<TaskActionState> {
  formData.set('command', 'review');
  if (!['true', 'false'].includes(readString(formData, 'approved'))) return failure('Choose a review decision.');
  return changeTaskLifecycle(previous, formData);
}

/* Delete ------------------------------------------------------------------ */

export async function deleteTask(taskId: string): Promise<TaskActionState> {
  const actor = await resolveActor();
  if (!actor.ok) return failure(actor.error);
  if (!canManageTasks(actor.profile.role)) {
    return failure('Only managing directors and project engineers can delete tasks.');
  }
  if (taskId === '') return failure('Missing task reference.');

  const deleted = await deleteTaskRow(taskId);
  if (!deleted.ok) return failure(deleted.error);

  revalidateAfterEdit();
  return { success: true, data: { taskId } };
}
