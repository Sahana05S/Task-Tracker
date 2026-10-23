import { randomUUID } from 'node:crypto';

import type { PostgrestError } from '@supabase/supabase-js';

import type { NewMissionScale, TaskFields } from '@/modules/tasks/internal/input';
import { executionError } from '@/shared/commands/result';
import { createClient } from '@/shared/supabase/server';
import type { Json } from '@/types/database';
import type { ActionResponse } from '@/types/tracker';
import { isConflictCode } from '@/shared/commands/conflict';

/**
 * Writes to tasks and their participants. PRIVATE.
 *
 * Each command returns its result or a message the form can show. RLS and the
 * RPCs remain the real boundary if a role check upstream is bypassed.
 */

type CommandResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Turns a PostgREST error into something a user can act on.
 *
 * `42501` is the one that matters: it is what RLS returns when a policy refuses
 * the write, and it is the signal that the checks upstream were circumvented or
 * are out of step with the policies.
 */
function describeDatabaseError(error: PostgrestError): string {
  if (isConflictCode(error.code)) {
    return 'Someone changed the participants. Reload the task and review the current shares.';
  }
  switch (error.code) {
    case '23505':
      return 'That task tag is already in use. Task tags must be unique.';
    case '23503':
      return 'The selected assignee or reviewer no longer exists.';
    case '23514':
      return error.message;
    case '42501':
      return 'You do not have permission to perform that change.';
    default:
      return error.message;
  }
}

/** Options that differ between creating and editing a task. */
export interface SaveTaskOptions {
  taskId: string | null;
  extraFields: Record<string, Json>;
  expectedVersion: number | null;
  acceptLegacyShares: boolean;
  operationId: string;
}

/** Creates or updates a task with its assignees, reviewers and shares in one RPC. */
export async function saveTaskWithParticipants(
  fields: TaskFields,
  options: SaveTaskOptions,
): Promise<CommandResult<string>> {
  const { taskTag, title, category, priority, dueDate, assigneeIds, reviewerIds, shares } = fields;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('save_task_with_participants', {
    p_task_id: options.taskId,
    p_fields: { task_tag: taskTag, title, category, priority, due_date: dueDate, ...options.extraFields },
    p_assignees: assigneeIds,
    p_reviewers: reviewerIds,
    p_share_units: shares,
    p_expected_version: options.expectedVersion,
    p_accept_legacy: options.acceptLegacyShares,
    p_operation_id: options.operationId || randomUUID(),
  });
  if (error) return { ok: false, error: describeDatabaseError(error) };
  return { ok: true, value: data };
}

/**
 * Creates a mission with an hours or activity-count scale in one RPC
 * (migration 61): the plain save at scale 0, then the versioned scale command.
 */
export async function createTaskWithScale(
  fields: TaskFields,
  options: Omit<SaveTaskOptions, 'taskId' | 'expectedVersion'>,
  scale: Exclude<NewMissionScale, { mode: 'manual' }>,
): Promise<CommandResult<string>> {
  const { taskTag, title, category, priority, dueDate, assigneeIds, reviewerIds, shares } = fields;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_task_with_scale', {
    p_fields: { task_tag: taskTag, title, category, priority, due_date: dueDate, ...options.extraFields },
    p_assignees: assigneeIds,
    p_reviewers: reviewerIds,
    p_share_units: shares,
    p_accept_legacy: options.acceptLegacyShares,
    p_scale: scale,
    p_operation_id: options.operationId || randomUUID(),
  });
  if (error) return { ok: false, error: describeDatabaseError(error) };
  return { ok: true, value: data };
}

/** Runs a lifecycle command (transition, progress, scale, review) through its RPC. */
export async function runLifecycleCommand(
  taskId: string,
  command: string,
  payload: Json,
  version: number,
  operationId: string,
): Promise<ActionResponse<never> | null> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('task_lifecycle_command', {
    p_task_id: taskId,
    p_command: command,
    p_payload: payload,
    p_expected_version: version,
    p_operation_id: operationId,
  });
  return error ? { ...executionError(error), data: undefined } : null;
}

export interface TaskLifecycleState {
  readonly taskTag: string;
  readonly status: string;
  readonly version: number;
  readonly archived: boolean;
}

/** A mission's tag, status and lifecycle version as the caller may see them. */
export async function readTaskLifecycle(taskId: string): Promise<TaskLifecycleState | null> {
  const supabase = await createClient();
  const found = await supabase
    .from('tasks')
    .select('task_tag, status, lifecycle_version, archived_effective_date')
    .eq('id', taskId)
    .maybeSingle();
  if (found.error || !found.data) return null;
  return {
    taskTag: found.data.task_tag,
    status: found.data.status,
    version: found.data.lifecycle_version ?? 0,
    archived: !!found.data.archived_effective_date,
  };
}

export interface SubMissionInput {
  readonly parentTaskId: string;
  readonly checklistId: string | null;
  readonly section: string;
  readonly parentNodeId: string | null;
  readonly title: string;
  readonly dueDate: string | null;
  readonly expectedVersion: number;
  readonly operationId: string;
}

/**
 * Creates a sub-mission: a real mission, its linked row in the parent's
 * checklist and the parent link, in one RPC (migration 68).
 */
export async function createSubMissionRow(input: SubMissionInput): Promise<CommandResult<Json>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('submission_create', {
    p_parent_task: input.parentTaskId,
    p_checklist: input.checklistId,
    p_section: input.section,
    p_parent_node: input.parentNodeId,
    p_payload: { title: input.title, due_date: input.dueDate },
    p_expected_version: input.expectedVersion,
    p_operation: input.operationId,
  });
  if (error) return { ok: false, error: describeDatabaseError(error) };
  return { ok: true, value: data as Json };
}

/** Looks up a task id by its tag, for linked-scale inputs. */
export async function findTaskIdByTag(taskTag: string): Promise<string | null> {
  const supabase = await createClient();
  const found = await supabase.from('tasks').select('id').eq('task_tag', taskTag).maybeSingle();
  return found.error || !found.data ? null : found.data.id;
}

/**
 * Deletes a task.
 *
 * daily_task_logs cascades on task deletion, so this also discards the effort
 * history. Consider setting status to 'Discarded' instead when the logged hours
 * still matter for past months.
 */
export async function deleteTaskRow(taskId: string): Promise<CommandResult<null>> {
  const supabase = await createClient();
  const { error } = await supabase.from('tasks').delete().eq('id', taskId);
  if (error) return { ok: false, error: describeDatabaseError(error) };
  return { ok: true, value: null };
}
